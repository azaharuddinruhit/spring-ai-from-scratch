# Module 6 findings

Verified against Spring AI 2.0.2, Spring Boot 4.1.2 and Testcontainers 2.0.5 (the version Boot 4.1.2 manages), by reading the
sources and running the code in `code/` against Docker 29.8 (Docker Desktop on Windows, WSL 2, no GPU).

## Testcontainers

- `spring-ai-spring-boot-testcontainers` 2.0.2 registers `@ServiceConnection` factories for Ollama, Chroma, Milvus, OpenSearch,
  Qdrant, Typesense, Weaviate and the Docker MCP gateway. There is none for PgVector: pgvector is PostgreSQL, so Boot's own
  `PostgreSQLContainer` connection details apply (with `pgvector/pgvector:pg17` declared `asCompatibleSubstituteFor("postgres")`).
- Testcontainers 2 moved the modules: `org.testcontainers.postgresql.PostgreSQLContainer` (the old
  `org.testcontainers.containers.PostgreSQLContainer` still exists, deprecated), `org.testcontainers.ollama.OllamaContainer`.
  Artifacts are `testcontainers-postgresql`, `testcontainers-ollama`, `testcontainers-junit-jupiter`.
- The Ollama connection details only set the base URL (`OllamaContainer.getEndpoint()`); models are not pulled.
- `OllamaContainer` asks Docker for every GPU when `docker info` lists an `nvidia` runtime. Docker Desktop on WSL lists one even
  without an NVIDIA GPU, and the container then fails to start: `nvidia-container-cli: initialization error: WSL environment
  detected but no adapters were found`. Fix: `.withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withDeviceRequests(List.of()))`
  (marked `// probe-only` in the code, because it also disables a real GPU).
- `ollama/ollama:0.40.16` is 8.5 GB unpacked (GPU libraries included) and declares no `VOLUME`, so `commitToImage` keeps pulled
  models.
- Reuse: `.withReuse(true)` only takes effect when `testcontainers.reuse.enable=true` is set in `~/.testcontainers.properties` or
  as `TESTCONTAINERS_REUSE_ENABLE`. The reused container survives the JVM, so models download once per machine.
- Testcontainers connects to `getHost()`, which is `localhost` by default. On this machine the hosts file maps `localhost` to
  another address, so the runs set `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1` (environment only, no code).

## Ollama model initialisation

- `spring.ai.ollama.init.pull-model-strategy` defaults to `never`: against a fresh container the first call fails because the
  model is missing. `when_missing` pulls the chat and embedding models at startup; `spring.ai.ollama.init.chat.additional-models`
  pulls more (the judge).
- `spring.ai.ollama.init.timeout` defaults to 5 minutes. A first download of `qwen2.5:1.5b` took longer on this connection and
  startup failed with `TimeoutException: Did not observe any item or terminal signal within 300000ms` wrapped in
  `RetryExhaustedException: Retries exhausted: 0/0` (`max-retries` defaults to 0).

## Evaluators

- `RelevancyEvaluator` and `FactCheckingEvaluator` live in `spring-ai-client-chat`, package `org.springframework.ai.chat.evaluation`.
- Both pass only when the judge's whole reply, stripped, equals `yes` ignoring case. "Yes." or "YES, it matches" fail.
- `RelevancyEvaluator` score is 1 or 0; `FactCheckingEvaluator` returns no score.
- The supporting data is `EvaluationRequest.getDataList()` texts joined with `System.lineSeparator()`.
- `RelevancyEvaluator` sends query, response and context; `FactCheckingEvaluator` sends only the document and the claim (the
  answer), not the question. `FactCheckingEvaluator.forBespokeMinicheck` uses a bare prompt for the bespoke-minicheck model.
- `RetrievalAugmentationAdvisor` copies the retrieved documents into the `ChatResponse` metadata under `DOCUMENT_CONTEXT`
  (`rag_document_context`), so the service can return them with the answer.

## What the first full-app tests found

- **The support app refused every order question.** Order questions retrieve no knowledge chunks, and the default
  `ContextualQueryAugmenter` (`allowEmptyContext` false) replaces the user message with "The user query is outside your
  knowledge base. Politely inform the user that you can't answer it." The model never saw "Where is my order 1042?", never called
  `findOrder`, and answered "I'm sorry, but I can't assist with that." Module 4 warned about the trade-off; Module 5 added tools to
  the same `ChatClient` and the 63 unit tests (scripted model, no real RAG) could not see it. Fix in `KnowledgeRagConfig`:
  `.queryAugmenter(ContextualQueryAugmenter.builder().allowEmptyContext(true).build())`, with the "only from the context" rule
  moved into the system prompt. `SupportChatIT` passes after the fix. The fix went into Module 5 (Tool Calling lesson and
  `lesson-src/module-5/code`, 63 tests still pass), where tools first join the RAG client.
- **Small models skip tools.** With the same two tool definitions and temperature 0, `qwen2.5:1.5b` asked for the order number
  instead of calling `findOrder` (direct `/api/chat` call and the full app); `llama3.2:3b` called `findOrder({"orderNumber": "1042"})`.
  The tests use `llama3.2:3b`.
- `PaymentClient` has no implementation in the lesson code (the lesson says to implement it with the provider's SDK), so the
  full context only starts with a stand-in. `@MockitoBean(types = PaymentClient.class)` on the `@SupportIntegrationTest`
  meta-annotation works (type-level `@MockitoBean`, Spring Framework 6.2+).
- Test classes whose bean overrides differ get separate contexts: `SupportChatIT` (`@MockitoSpyBean OrderRepository`) starts its
  own PostgreSQL container; the reused Ollama container is shared.
- Run times on this machine (CPU only): `KnowledgeSearchIT` 21 s, `SupportChatIT` 42 s, models already in the container.

## The eval, run with small local models

Machine limits (CPU only, under 1 GB free host memory) ruled out the 8B judge: a run with `llama3.1:8b` was stopped for low
memory. `JudgeVerdictTest` pins the verdict parsing with a scripted judge; the real run used `llama3.2:3b` for both the app and
the judge (`-Dsupport.eval.judge-model=llama3.2:3b`). Log: `probes/eval-run-llama3.2-3b.log`. It failed, correctly:

- The app model answered "I don't know" to three questions whose chunks were in its prompt (refund time: 2 sources; refund window
  and refund card: 1 source each).
- It called tools for policy questions: `findOrder` 8 times, `recentOrders` 2, `proposeRefund` 4 (nobody asked for a refund; the
  Module 5 confirmation step is what keeps that harmless).
- "Where do I find my tracking number?" retrieved nothing: the 0.5 similarity threshold was calibrated for
  `text-embedding-3-small`, not `nomic-embed-text`.
- The 3B judge answered `NO` to correct answers ("We ship every order within two business days." with the shipping chunk as
  context; checked again with a direct `/api/chat` call: `NO`). All six relevancy verdicts failed.
- So the gate (pass rate >= 0.8) failed. The flow is verified (ingestion, sources returned with the answer, both evaluators, the
  gate); a passing run needs the production model and a stronger judge, which this machine can't run.
- Timing: 61 s for six questions, 12 answer-side model calls and 6 judge calls before the first assertion failed.

## Same question, five runs (sandbox data)

`probes/variability.py` asked `llama3.2:3b` the same question five times at temperature 0.8, with the support app's system
prompt and the 2.0.2 `ContextualQueryAugmenter` template around the refunds chunk. Replies: `probes/variability-window.json`.

- "How long does a refund take to reach my card?" gave the same sentence five times (copied from the chunk). The same model in
  the full app, with tool definitions in the prompt, answered "I don't know".
- "I bought a router three weeks ago ... Can I still get a refund, and when will I see it?" gave five different wordings. Run 2
  never says when the money arrives. Run 5 says 30 days "is 3 weeks" and invents "12 to 18 business days".
- `probes/judge.py` sent the five replies through the exact 2.0.2 evaluator prompts to `llama3.2:3b`
  (`variability-window-judge-llama3.2-3b.json`): relevancy `NO` five times; fact checking answered in sentences ("Yes. The claim
  is supported ...", "No. ..."), so every verdict fails the bare-`yes` parsing, although its sentences said yes to runs 1, 2, 4.
- A one-word prompt ("Reply with one word, yes or no") made it answer `No` five times. A reasoning-then-boolean JSON schema made
  it reject all five with wrong reasoning (it called three weeks "outside the 30-day timeframe"). A 3B model can't judge this.

## Gradle

Checked with Gradle 9.5.1 (the newest distribution on this machine; the course pins 9.9.1) on a small project with one tagged
and one untagged JUnit 6 test (`scratchpad` project, not kept):

- `test { useJUnitPlatform { excludeTags 'eval' } }` runs only the untagged test; a registered
  `evalTest(Test)` with `useJUnitPlatform { includeTags 'eval' }` runs only the tagged one.
- Without `testClassesDirs = sourceSets.test.output.classesDirs` and `classpath = sourceSets.test.runtimeClasspath`, the
  registered task reports `NO-SOURCE`, runs nothing, and the build still succeeds: a CI job stays green with no eval run.

## Observability (Lesson 2)

Verified by reading the 2.0.2 and Boot 4.1.2 classes and by recording the support app (`code/test/.../TraceRecordingProbe.java`,
`probes/trace-before.json`, `probes/trace-after.json`, `probes/trace-run-after.log`; `probes/trace-to-sandbox.py` turns them into
`src/data/recorded-traces.json` for `TraceLab`).

- `spring-boot-starter-opentelemetry` (Boot 4.1.2) alone brings the OpenTelemetry SDK, `micrometer-tracing-bridge-otel`,
  `micrometer-registry-otlp` and the OTLP exporters. The recordings ran without the actuator.
- Observation names: `spring.ai.chat.client`, `spring.ai.advisor`, `gen_ai.client.operation` (chat and embedding),
  `db.vector.client.operation`, `spring.ai.tool`. Model calls nest under the `call` advisor, tools under `tool_calling`, the
  embedding under the vector query.
- Metrics: `gen_ai.client.operation` (timer) and `gen_ai.client.token.usage` (counter, `gen_ai.token.type` input/output/total,
  tagged with the observation's low-cardinality values: operation name, system, request and response model).
- Cache tokens: `Usage.getCacheReadInputTokens()` / `getCacheWriteInputTokens()` (2.0.0+); OpenAI fills the read count from
  `prompt_tokens_details.cached_tokens` and its prompt count includes them. They appear only as span attributes
  `gen_ai.usage.cache_read.input_tokens` / `cache_creation.input_tokens`, not in the token metric.
- Content switches (all default false): `spring.ai.chat.observations.log-prompt` / `log-completion` (log at INFO; with a tracer
  the line carries `[traceId-spanId]`, nothing goes into the span), `spring.ai.chat.client.observations.log-prompt` /
  `log-completion`, `spring.ai.tools.observations.include-content` (adds `spring.ai.tool.call.arguments` and `.result` span
  attributes), `spring.ai.vectorstore.observations.log-query-response`. Each logs a WARN at startup when on.
- `db.vector.query.content` is always a span attribute (`DefaultVectorStoreObservationConvention.queryContent`).
- Boot: `management.tracing.sampling.probability` defaults to 0.1. The OTLP trace connection exists only when
  `management.opentelemetry.tracing.export.otlp.endpoint` is set (`management.otlp.tracing.endpoint` is deprecated since 4.0 at
  error level). `management.otlp.metrics.export.url` defaults to `http://localhost:4318/v1/metrics`; without a collector the
  registry logs "Failed to publish metrics" and the trace exporter "Failed to export spans". Without `spring.application.name`
  the resource is `service.name=unknown_service`.
- Boot adds a plain `ObservationHandler` bean to the registry (the probe's recording handler and `TokenCostMeter` both ran).

What the recordings showed (llama3.2:3b, CPU only):

- `CompressionQueryTransformer.transform` calls the model for every query, with no empty-history check, and
  `RetrievalAugmentationAdvisor` passes the whole prompt as history (system message and the current question included), so it is
  never empty. On "Where is my order 1042?" the rewrite returned "Can you please provide the follow-up query to synthesize into a
  concise query?" and pgvector searched for that. Fix: rewrite only when the history holds an assistant message, on a cheaper
  model (`builder.clone().defaultOptions(ChatOptions.builder().model(...))`; the trace shows `chat qwen2.5:1.5b` for the rewrite).
- With include-content on, the second turn ("How long does a refund take to reach my card?") showed
  `proposeRefund({"orderNumber":"1042","reason":"None"})` creating a PENDING refund nobody asked for. The Module 5 confirmation
  step keeps it harmless; without content the trace only shows that the tool ran.
- The rewrite on `qwen2.5:1.5b` took 10.7 s in the recording. A cold `qwen2.5:1.5b` call measured alone spent 2.83 s of 3.54 s
  in `load_duration`, so most of it is Ollama loading a second model on CPU.
- llama3.2's Ollama template renders tool definitions only into a prompt whose last message is a user message: the same
  question cost 169 prompt tokens with one tool, 33 without; after a tool result, 100. So the call after a tool reports fewer
  input tokens (412 then 201). Ollama reported the same count warm and cold (no cache discount).
- The orders fixture had no `refunds` table, so `proposeRefund` failed with SQL errors; `orders.sql` now creates it.
