package com.example.probe;

import java.util.List;

import org.springframework.ai.decision.DecisionModel;
import org.springframework.ai.document.Document;
import org.springframework.ai.rag.Query;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentReranker;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;

/** How long the filter and the reranker take for six passages, one at a time and at the default concurrency, model warm. */
@SpringBootApplication
public class ScreeningTimeProbe {

    public static void main(String[] args) {
        try (var context = new SpringApplicationBuilder(ScreeningTimeProbe.class).web(WebApplicationType.NONE).run(args)) {
            DecisionModel model = context.getBean(DecisionModel.class);
            Query query = new Query("How many days do I have to return a blender?");
            List<Document> six = RagRecordingProbe.PASSAGES.entrySet().stream().limit(6)
                    .map(e -> Document.builder().id(e.getKey()).text(e.getValue()).build()).toList();
            DecisionDocumentFilter.builder(model).build().process(query, six); // warm-up
            for (int round = 0; round < 2; round++) {
                for (int concurrency : new int[] {1, 4}) {
                    long start = System.nanoTime();
                    DecisionDocumentFilter.builder(model).concurrency(concurrency).build().process(query, six);
                    long filter = (System.nanoTime() - start) / 1_000_000;
                    start = System.nanoTime();
                    DecisionDocumentReranker.builder(model).concurrency(concurrency).build().process(query, six);
                    long rerank = (System.nanoTime() - start) / 1_000_000;
                    System.out.printf("PROBE concurrency %d: filter %d ms, reranker %d ms for 6 passages%n", concurrency, filter, rerank);
                }
            }
        }
    }
}
