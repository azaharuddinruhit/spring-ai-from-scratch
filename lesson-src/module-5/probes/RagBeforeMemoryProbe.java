package com.example.support.knowledge;

import java.util.List;
import java.util.Map;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.document.Document;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.preretrieval.query.transformation.CompressionQueryTransformer;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.ai.vectorstore.SimpleVectorStore;
import org.springframework.core.Ordered;

public class RagBeforeMemoryProbe {
    public static void main(String[] a) {
        for (int ragOrder : new int[] {Ordered.HIGHEST_PRECEDENCE + 100, Ordered.HIGHEST_PRECEDENCE + 225}) {
            var store = SimpleVectorStore.builder(new KeywordEmbeddingModel()).build();
            store.add(List.of(new Document("Refunds take 5 business days.", Map.of(KnowledgeFilters.PRODUCT, "billing", KnowledgeFilters.AUDIENCE, "CUSTOMER")),
                    new Document("Gift card refunds take 10 business days.", Map.of(KnowledgeFilters.PRODUCT, "billing", KnowledgeFilters.AUDIENCE, "CUSTOMER"))));
            ChatModel model = p -> new ChatResponse(List.of(new Generation(new AssistantMessage(
                    p.getUserMessage().getText().contains("Standalone query:") ? "How long do refunds take?" : "Done."))));
            var rag = RetrievalAugmentationAdvisor.builder()
                    .queryTransformers(CompressionQueryTransformer.builder().chatClientBuilder(ChatClient.builder(model)).build())
                    .documentRetriever(VectorStoreDocumentRetriever.builder().vectorStore(store).topK(5).similarityThreshold(0.5)
                            .filterExpression(KnowledgeFilters.customerDocuments()).build())
                    .order(ragOrder).build();
            var sessions = DefaultSessionService.builder().sessionRepository(InMemorySessionRepository.builder().build()).build();
            var client = ChatClient.builder(model).defaultAdvisors(rag)
                    .defaultAdvisors(SessionAdvisors.builder(sessions).memory(m -> m.order(Ordered.HIGHEST_PRECEDENCE + 210)).build()).build();
            String q = "How long do refunds usually take?";
            client.prompt().user(q).advisors(SessionAdvisors.session("c1")).call().content();
            String stored = sessions.getMessages("c1").getFirst().getText();
            System.out.println("rag at +" + (ragOrder - Ordered.HIGHEST_PRECEDENCE) + ": question " + q.length() + " chars, stored " + stored.length() + " chars");
        }
        System.exit(0);
    }
}
