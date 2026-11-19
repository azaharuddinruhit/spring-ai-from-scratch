package com.example.support;

import com.example.support.chat.SupportChatService;
import com.example.support.knowledge.Audience;
import com.example.support.knowledge.KnowledgeIngestionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.tracing.handler.TracingObservationHandler;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.jdbc.Sql;

/** Probe, not lesson code: records every span of a two-turn conversation for the Observability sandbox. */
@SupportIntegrationTest
@Sql("/orders.sql")
@Import(TraceRecordingProbe.Recorder.class)
class TraceRecordingProbe {

    static final List<Map<String, Object>> SPANS = new ArrayList<>();

    @TestConfiguration(proxyBeanMethods = false)
    static class Recorder {
        @Bean
        ObservationHandler<Observation.Context> recordingHandler() {
            var starts = new ConcurrentHashMap<Observation.Context, Long>();
            return new ObservationHandler<>() {
                public void onStart(Observation.Context context) {
                    starts.put(context, System.nanoTime());
                }
                public void onStop(Observation.Context context) {
                    long stop = System.nanoTime();
                    TracingObservationHandler.TracingContext tracing = context.get(TracingObservationHandler.TracingContext.class);
                    if (tracing == null || tracing.getSpan() == null) {
                        return;
                    }
                    Map<String, Object> span = new LinkedHashMap<>();
                    span.put("traceId", tracing.getSpan().context().traceId());
                    span.put("spanId", tracing.getSpan().context().spanId());
                    span.put("parentId", tracing.getSpan().context().parentId());
                    span.put("sampled", tracing.getSpan().context().sampled());
                    span.put("name", context.getName());
                    span.put("contextualName", context.getContextualName());
                    span.put("startNanos", starts.getOrDefault(context, stop));
                    span.put("endNanos", stop);
                    Map<String, String> low = new LinkedHashMap<>();
                    context.getLowCardinalityKeyValues().forEach(kv -> low.put(kv.getKey(), kv.getValue()));
                    Map<String, String> high = new LinkedHashMap<>();
                    context.getHighCardinalityKeyValues().forEach(kv -> high.put(kv.getKey(), kv.getValue()));
                    span.put("low", low);
                    span.put("high", high);
                    synchronized (SPANS) {
                        SPANS.add(span);
                    }
                }
                public boolean supportsContext(Observation.Context context) {
                    return true;
                }
            };
        }
    }

    @Test
    void recordTwoTurns(@Autowired SupportChatService chat, @Autowired KnowledgeIngestionService ingestion) throws Exception {
        ingestion.ingest(new ClassPathResource("knowledge/refunds.md"), "billing", Audience.CUSTOMER);
        ingestion.ingest(new ClassPathResource("knowledge/shipping.md"), "billing", Audience.CUSTOMER);
        UUID chatId = UUID.randomUUID();
        List<Map<String, Object>> turns = new ArrayList<>();
        for (String question : List.of("Where is my order 1042?", "How long does a refund take to reach my card?")) {
            SPANS.clear();
            String answer = chat.ask("alice", chatId, "billing", question, Locale.ENGLISH).text();
            turns.add(Map.of("question", question, "answer", answer, "spans", List.copyOf(SPANS)));
        }
        Path out = Path.of(System.getProperty("probe.out", "trace.json"));
        Files.writeString(out, new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(turns));
        System.out.println("WROTE " + out.toAbsolutePath());
    }
}
