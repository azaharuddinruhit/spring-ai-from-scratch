package com.example.support.knowledge;

import java.util.List;

import org.springframework.ai.document.Document;
import org.springframework.ai.reader.pdf.PagePdfDocumentReader;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeSearchService {

    private static final int TOP_K = 5;
    private static final double MIN_SIMILARITY = 0.5; // calibrated for text-embedding-3-small; re-check if the model changes

    private final VectorStore vectorStore;

    public KnowledgeSearchService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public List<KnowledgeHit> search(String query, String product) {
        return vectorStore.similaritySearch(SearchRequest.builder()
                        .query(query)
                        .topK(TOP_K)
                        .similarityThreshold(MIN_SIMILARITY)
                        .filterExpression(KnowledgeFilters.customerDocuments(product))
                        .build())
                .stream()
                .map(KnowledgeSearchService::toHit)
                .toList();
    }

    private static KnowledgeHit toHit(Document chunk) {
        return new KnowledgeHit(
                (String) chunk.getMetadata().get(KnowledgeFilters.SOURCE),
                (Integer) chunk.getMetadata().get(PagePdfDocumentReader.METADATA_START_PAGE_NUMBER),
                chunk.getScore(),
                chunk.getText());
    }

    /** One search result. {@code page} is null for sources without pages, such as Markdown. */
    public record KnowledgeHit(String source, Integer page, Double score, String text) {
    }
}
