package com.example.support.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import com.example.support.knowledge.KnowledgeSearchService.KnowledgeHit;

import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SimpleVectorStore;
import org.springframework.ai.vectorstore.pgvector.PgVectorFilterExpressionConverter;

class KnowledgeSearchServiceTest {

    private final SimpleVectorStore vectorStore = SimpleVectorStore.builder(new KeywordEmbeddingModel()).build();
    private final KnowledgeSearchService search = new KnowledgeSearchService(vectorStore);

    KnowledgeSearchServiceTest() {
        vectorStore.add(List.of(
                chunk("Refunds take 5 business days.", "billing", Audience.CUSTOMER),
                chunk("Refunds over 500 USD need a manager override in the admin console.", "billing", Audience.STAFF),
                chunk("Refunds for lost parcels take 10 business days.", "shipping", Audience.CUSTOMER)));
    }

    @Test
    void findsOnlyCustomerDocumentsForTheProduct() {
        assertThat(search.search("How many days do refunds take?", "billing"))
                .extracting(KnowledgeHit::text)
                .containsExactly("Refunds take 5 business days.");
    }

    @Test
    void userInputCannotWidenTheFilter() {
        assertThat(search.search("refunds override", "billing' || audience == 'STAFF")).isEmpty();
    }

    @Test
    void theFilterIsEscapedInTheSqlToo() {
        String sql = new PgVectorFilterExpressionConverter()
                .convertExpression(KnowledgeFilters.customerDocuments("billing' || audience == 'STAFF"));

        assertThat(sql).isEqualTo("metadata::jsonb @@ "
                + "'$.\"audience\" == \"CUSTOMER\" && $.\"product\" == \"billing'' || audience == ''STAFF\"'::jsonpath");
    }

    private static Document chunk(String text, String product, Audience audience) {
        return new Document(text, Map.of(
                KnowledgeFilters.SOURCE, product + ".md",
                KnowledgeFilters.PRODUCT, product,
                KnowledgeFilters.AUDIENCE, audience.name()));
    }
}
