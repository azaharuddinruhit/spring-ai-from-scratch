package com.example.support.knowledge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/** Loads the knowledge base at startup: one passage per line, "id: text". Module 4's ETL lesson covers real documents. */
@Component
class KnowledgeLoader implements ApplicationRunner {

    private final VectorStore vectorStore;
    private final Resource passages;

    KnowledgeLoader(VectorStore vectorStore, @Value("classpath:knowledge/passages.txt") Resource passages) {
        this.vectorStore = vectorStore;
        this.passages = passages;
    }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        List<Document> documents = passages.getContentAsString(StandardCharsets.UTF_8).lines()
                .filter(line -> !line.isBlank())
                .map(line -> line.split(": ", 2))
                .map(parts -> Document.builder().id(parts[0]).text(parts[1]).build())
                .toList();
        vectorStore.add(documents);
    }
}
