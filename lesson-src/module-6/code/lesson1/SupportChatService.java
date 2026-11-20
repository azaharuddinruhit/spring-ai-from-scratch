package com.example.support.chat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import com.example.support.knowledge.KnowledgeFilters;
import com.example.support.tools.CustomerToolContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.document.Document;
import org.springframework.ai.model.tool.ToolCallDecision;
import org.springframework.ai.model.tool.ToolCallDecisions;
import org.springframework.ai.model.tool.ToolCallLimitExceededException;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.session.SessionService;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.stereotype.Service;

@Service
public class SupportChatService {

    static final String TOOL_LIMIT_ANSWER = "I couldn't finish looking that up. A support agent will follow up in this chat.";
    static final String CONFIRMATION_ANSWER = "Please confirm or decline this in the app.";
    static final String DECLINED = "The customer declined.";

    private static final Logger log = LoggerFactory.getLogger(SupportChatService.class);

    private final ChatClient supportChatClient;
    private final SessionService sessionService;
    private final ToolCallingManager toolCallingManager;
    private final SupportTools tools;

    public SupportChatService(ChatClient supportChatClient, SessionService sessionService,
                              ToolCallingManager toolCallingManager, SupportTools tools) {
        this.supportChatClient = supportChatClient;
        this.sessionService = sessionService;
        this.toolCallingManager = toolCallingManager;
        this.tools = tools;
    }

    public SupportAnswer ask(String userId, UUID chatId, String product, String question, Locale language) {
        return answer(userId, chatId, language, request -> request
                .user(question)
                // Replaces the retriever's default filter, so it must keep the audience condition.
                .advisors(advisor -> advisor.param(VectorStoreDocumentRetriever.FILTER_EXPRESSION,
                        KnowledgeFilters.customerDocuments(product))));
    }

    /** The tool calls waiting for the customer's decision: the session's last message, when it is an unanswered call. */
    public List<AssistantMessage.ToolCall> awaitingConfirmation(String userId, UUID chatId) {
        return pausedReply(sessionId(userId, chatId)).map(AssistantMessage::getToolCalls).orElse(List.of());
    }

    /** Runs the calls the customer confirmed, or tells the model they declined, and returns the model's answer. */
    public SupportAnswer confirm(String userId, UUID chatId, boolean approved, Locale language) {
        AssistantMessage paused = pausedReply(sessionId(userId, chatId)).orElseThrow(NothingToConfirmException::new);
        // Every call of the reply needs a decision, the ones that didn't need confirmation too.
        var decisions = new ToolCallDecisions(ToolCallDecisions.toolCallKeys(paused).stream()
                .map(key -> approved ? ToolCallDecision.allow(key) : ToolCallDecision.deny(key, DECLINED))
                .toList());
        var options = ToolCallingChatOptions.builder()
                .toolCallbacks(tools.callbacks())
                .toolContext(CustomerToolContext.of(userId))
                .build();
        List<Message> history = toolCallingManager
                .executeToolCalls(new Prompt(List.of(), options), new ChatResponse(List.of(new Generation(paused))), decisions)
                .conversationHistory();
        // The session holds the question and the paused reply; send only the tool results.
        return answer(userId, chatId, language, request -> request.messages(history.getLast()));
    }

    public void forget(String userId, UUID chatId) {
        sessionService.delete(sessionId(userId, chatId));
    }

    private SupportAnswer answer(String userId, UUID chatId, Locale language,
                                 Consumer<ChatClient.ChatClientRequestSpec> request) {
        ChatClient.ChatClientRequestSpec spec = supportChatClient.prompt()
                .toolContext(CustomerToolContext.of(userId))
                .advisors(SessionAdvisors.session(sessionId(userId, chatId)))
                .advisors(advisor -> advisor
                        .param(TokenBudgetAdvisor.USER_ID, userId)
                        .param(AnswerLanguageAdvisor.LANGUAGE, language));
        request.accept(spec);
        ChatResponse response = spec.call().chatResponse();
        Generation answer = response == null ? null : response.getResult();
        if (answer == null) {
            throw new IllegalStateException("The model returned no answer");
        }
        if (ToolCallDecisions.isAwaitingDecision(response)) {
            return new SupportAnswer(CONFIRMATION_ANSWER, List.of());
        }
        if (ToolCallLimitExceededException.FINISH_REASON.equals(answer.getMetadata().getFinishReason())) {
            log.warn("Tool call limit reached for {}: {}", userId, answer.getOutput().getText());
            return new SupportAnswer(TOOL_LIMIT_ANSWER, List.of());
        }
        List<Document> sources = response.getMetadata().getOrDefault(RetrievalAugmentationAdvisor.DOCUMENT_CONTEXT, List.of());
        return new SupportAnswer(answer.getOutput().getText(), sources);
    }

    private Optional<AssistantMessage> pausedReply(String sessionId) {
        List<Message> messages = sessionService.findById(sessionId) == null ? List.of() : sessionService.getMessages(sessionId);
        return messages.isEmpty() || !(messages.getLast() instanceof AssistantMessage reply) || !reply.hasToolCalls()
                ? Optional.empty()
                : Optional.of(reply);
    }

    /** The answer, and the knowledge chunks it was given. Evals check the answer against exactly these. */
    public record SupportAnswer(String text, List<Document> sources) {
    }

    /** A session id that only this user's chat maps to, so a chat id alone never reaches another user's session. */
    static String sessionId(String userId, UUID chatId) {
        return UUID.nameUUIDFromBytes((userId + ":" + chatId).getBytes(StandardCharsets.UTF_8)).toString();
    }
}
