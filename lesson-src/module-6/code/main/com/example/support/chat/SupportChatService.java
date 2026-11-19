package com.example.support.chat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.example.support.knowledge.KnowledgeFilters;
import com.example.support.tools.CustomerToolContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.document.Document;
import org.springframework.ai.model.tool.ToolCallLimitExceededException;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.stereotype.Service;

@Service
public class SupportChatService {

    static final String TOOL_LIMIT_ANSWER = "I couldn't finish looking that up. A support agent will follow up in this chat.";

    private static final Logger log = LoggerFactory.getLogger(SupportChatService.class);

    private final ChatClient supportChatClient;
    private final ChatMemory chatMemory;

    public SupportChatService(ChatClient supportChatClient, ChatMemory chatMemory) {
        this.supportChatClient = supportChatClient;
        this.chatMemory = chatMemory;
    }

    public SupportAnswer ask(String userId, UUID chatId, String product, String question, Locale language) {
        ChatResponse response = supportChatClient.prompt()
                .user(question)
                .toolContext(CustomerToolContext.of(userId))
                .advisors(advisor -> advisor
                        .param(ChatMemory.CONVERSATION_ID, conversationId(userId, chatId))
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
            return new SupportAnswer(TOOL_LIMIT_ANSWER, List.of());
        }
        List<Document> sources = response.getMetadata().getOrDefault(RetrievalAugmentationAdvisor.DOCUMENT_CONTEXT, List.of());
        return new SupportAnswer(answer.getOutput().getText(), sources);
    }

    public void forget(String userId, UUID chatId) {
        chatMemory.clear(conversationId(userId, chatId));
    }

    /** The answer, and the knowledge chunks it was given. Evals check the answer against exactly these. */
    public record SupportAnswer(String text, List<Document> sources) {
    }

    /** A UUID that only this user's chat maps to, and that fits the 36-character JDBC column. */
    static String conversationId(String userId, UUID chatId) {
        return UUID.nameUUIDFromBytes((userId + ":" + chatId).getBytes(StandardCharsets.UTF_8)).toString();
    }
}
