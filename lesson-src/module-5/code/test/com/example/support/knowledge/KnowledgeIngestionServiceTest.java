package com.example.support.knowledge;

import static com.example.support.knowledge.KnowledgeFilters.AUDIENCE;
import static com.example.support.knowledge.KnowledgeFilters.PRODUCT;
import static com.example.support.knowledge.KnowledgeFilters.SOURCE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.SimpleVectorStore;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

class KnowledgeIngestionServiceTest {

    private final SimpleVectorStore vectorStore = SimpleVectorStore.builder(new KeywordEmbeddingModel()).build();
    private final KnowledgeIngestionService ingestion = new KnowledgeIngestionService(vectorStore);

    @Test
    void tagsEveryChunkWithItsSourceProductAndAudience() {
        int chunks = ingestion.ingest(file("refunds.md", """
                # Refunds

                Refunds take 5 business days.

                ## Gift cards

                Gift cards can't be refunded.
                """), "billing", Audience.CUSTOMER);

        assertThat(allChunks()).hasSize(chunks).isNotEmpty().allSatisfy(chunk -> assertThat(chunk.getMetadata())
                .containsEntry(SOURCE, "refunds.md")
                .containsEntry(PRODUCT, "billing")
                .containsEntry(AUDIENCE, "CUSTOMER"));
    }

    @Test
    void reIngestingAFileReplacesItsOldChunks() {
        ingestion.ingest(file("refunds.md", "# Refunds\n\nRefunds take 30 days.\n"), "billing", Audience.CUSTOMER);
        ingestion.ingest(file("refunds.md", "# Refunds\n\nRefunds take 5 business days.\n"), "billing", Audience.CUSTOMER);

        assertThat(allChunks()).extracting(Document::getText).containsExactly("Refunds take 5 business days.");
    }

    @Test
    void rejectsFilesItCannotRead() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> ingestion.ingest(file("refunds.docx", "..."), "billing", Audience.CUSTOMER))
                .withMessage("Unsupported knowledge file: refunds.docx");
    }

    private List<Document> allChunks() {
        return vectorStore.similaritySearch(SearchRequest.builder().query("refunds").topK(100).build());
    }

    private static Resource file(String name, String content) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }
}
