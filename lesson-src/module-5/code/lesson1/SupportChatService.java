package com.example.support.chat;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

import com.example.support.knowledge.KnowledgeFilters;
import com.example.support.tools.CustomerToolContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.model.tool.ToolCallLimitExceededException;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.session.SessionService;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.stereotype.Service;

@Service
public class SupportChatService {

    static final String TOOL_LIMIT_ANSWER = "I couldn't finish looking that up. A support agent will follow up in this chat.";

    private static final Logger log = LoggerFactory.getLogger(SupportChatService.class);

    private final ChatClient supportChatClient;
    private final SessionService sessionService;

    public SupportChatService(ChatClient supportChatClient, SessionService sessionService) {
        this.supportChatClient = supportChatClient;
        this.sessionService = sessionService;
    }

    public String ask(String userId, UUID chatId, String product, String question, Locale language) {
        ChatResponse response = supportChatClient.prompt()
                .user(question)
                .toolContext(CustomerToolContext.of(userId))
                .advisors(SessionAdvisors.session(sessionId(userId, chatId)))
                .advisors(advisor -> advisor
                        .param(TokenBudgetAdvisor.USER_ID, userId)
                        .param(AnswerLanguageAdvisor.LANGUAGE, language)
                        // Replaces the retriever's default filter, so it must keep the audience condition.
                        .param(VectorStoreDocumentRetriever.FILTER_EXPRESSION, KnowledgeFilters.customerDocuments(product)))
                .call()
                .chatResponse();
        Generation answer = response == null ? null : response.getResult();
        if (answer == null) {
            throw new IllegalStateException("The model returned no answer");
        }
        if (ToolCallLimitExceededException.FINISH_REASON.equals(answer.getMetadata().getFinishReason())) {
            log.warn("Tool call limit reached for {}: {}", userId, answer.getOutput().getText());
            return TOOL_LIMIT_ANSWER;
        }
        return answer.getOutput().getText();
    }

    public void forget(String userId, UUID chatId) {
        sessionService.delete(sessionId(userId, chatId));
    }

    /** A session id that only this user's chat maps to, so a chat id alone never reaches another user's session. */
    static String sessionId(String userId, UUID chatId) {
        return UUID.nameUUIDFromBytes((userId + ":" + chatId).getBytes(StandardCharsets.UTF_8)).toString();
    }
}
