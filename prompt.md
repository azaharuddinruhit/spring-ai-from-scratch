You are a Principal Java & Spring Architect, AI Systems Educator, and Interactive Frontend Engineer.

Your task is to design and build a comprehensive, interactive web platform titled **"Spring AI from Scratch"**. The platform must teach Java and Spring Boot developers how to build, orchestrate, ground, secure, and scale production-grade AI applications using **Java 25, Gradle 9.x.x (Groovy DSL), Spring Boot 4.x.x, Spring Framework 7, and Spring AI 2.x.x**—progressing smoothly from absolute foundations to enterprise scale, backed by Mermaid sequence/architecture diagrams and an end-to-end capstone project.

### Phase 0: Mandatory Discovery Gate (DO NOT WRITE CODE YET)
Before creating any files, scaffolding a project, or writing code, **you must ask me 5 targeted scoping questions** to align on technical choices:
1. **Frontend Stack & UI Library:** What frontend framework (e.g., React + Vite, Next.js, Astro) and styling/component system (e.g., Tailwind CSS, shadcn/ui) should we use?
2. **Gradle Configuration Preference:** Should Gradle code snippets default to **Groovy DSL (`build.gradle`)**, or include a toggle for both?
3. **Interactive Sandboxes:** Should the interactive visualizers run as deterministic client-side simulations (zero backend required), or also include an optional Spring Boot 4 companion backend mode?
4. **Visual Aesthetic:** Do you prefer a clean Spring-inspired technical documentation theme (emerald/slate palette with crisp light/dark mode) or a dark-mode interactive engineering lab layout?
5. **Build Pacing:** Should we build the core app shell + Module 1 first and iterate module-by-module, or scaffold the entire curriculum structure upfront?

---

### Master Architecture & Curriculum Blueprint (Execute AFTER My Answers)

#### 1. Strict Technology Stack Baseline
All code snippets, build files, configuration properties, and architectural diagrams **must reflect modern cutting-edge enterprise standards**:
- **Language:** Java 25 (leveraging modern records, pattern matching, virtual threads, preview features where relevant, and JSpecify null-safety annotations).
- **Build Tool:** Gradle 9.x.x with Spring Boot 4.x.x and Spring Framework 7.
- **AI Framework:** Spring AI 2.x.x (immutable `ChatOptions` with `.mutate()`, Jackson 3 `JsonMapper`, `ChatClient` fluent API, recursive `ToolCallingAdvisor`, and native declarative MCP annotations).

---

#### 2. Pedagogical Anatomy of Every Lesson Page
Every lesson must be practical, idiomatic to Spring developers, and structured into 5 clear sections:
1. **Spring Mental Model & Mermaid Diagram:** Explain the abstraction mapping it to familiar Spring primitives, accompanied by an interactive or rendered **Mermaid sequence/flow diagram** showing data/request lifecycles.
2. **Interactive Visualizer / Sandbox:** A hands-on component where the learner manipulates configurations, triggers simulated requests, and inspects internal state transitions.
3. **Idiomatic Java 25 & Gradle 9 Code:** Complete, copy-pasteable Java 25 records, `@Configuration` beans, `application.yml` properties, and `build.gradle` dependencies.
4. **Production Gotchas & Security:** Real-world failure modes (e.g., runaway recursive tool loops, cross-tenant chat memory leaks, prompt injection via retrieved documents, strict-mode JSON schema mismatches) and how to prevent them.

---

#### 3. Six-Module Progressive Curriculum + Capstone Project

##### Module 1: Foundations & Core Abstractions
- **Spring AI 2.x Architecture on Java 25:** Spring Boot 4 baseline, Jackson 3 `JsonMapper`, virtual threads (`VirtualThreadTaskExecutor`), JSpecify null-safety, and immutable options with `.mutate()`.
- **`ChatClient` Fluent API:** Synchronous `.call()`, reactive `.stream()` (Flux/SSE), inspecting `ChatResponse` metadata, and default system prompts/advisors.
- **Multi-Provider Portability:** Swapping between OpenAI, Anthropic, Google GenAI, Amazon Bedrock, DeepSeek, and local Ollama / Docker Model Runner via Boot starters without changing Java service code.
- **Prompt Engineering & Multimodality:** `SystemMessage` / `UserMessage` / `AssistantMessage`, `.st` `PromptTemplate` resources, and multimodal inputs/outputs (`ImageModel`, `AudioTranscriptionModel`, `TextToSpeechModel`).

##### Module 2: Deterministic Structured Outputs
- **`StructuredOutputConverter` Ecosystem:** Mapping LLM text directly into Java 25 `record`s (`BeanOutputConverter`), `List<T>`, and `Map<String, Object>` via `.entity(...)`.
- **Native JSON Schema & Strict Mode:** Configuring provider-native structured outputs, handling optional fields in strict mode, and validation/retry patterns.

##### Module 3: The Advisors API & Chat Memory
- **Advisor Chain Internals & Mermaid Flow:** Execution lifecycle of `CallAdvisor` and `StreamAdvisor`, priority ordering (`Ordered`), and mutating `AdvisedRequest` / `AdvisedResponse`.
- **Built-in & Custom Advisors:** `SimpleLoggerAdvisor`, `SafeGuardAdvisor`, and writing custom advisors for PII redaction, token budgeting, and semantic caching.
- **Conversation Memory (`ChatMemory`):** Configuring `ChatMemoryRepository` backends (In-Memory, JDBC, Redis, Cassandra, Neo4j), `MessageChatMemoryAdvisor` vs. `VectorStoreChatMemoryAdvisor`, and isolating multi-user sessions via `CONVERSATION_ID`.

##### Module 4: Retrieval-Augmented Generation (RAG) & ETL Pipelines
- **The ETL Pipeline & Architecture Diagram:** `DocumentReader` (`PagePdfDocumentReader` with page ranges, Tika, Markdown, JSON) $\rightarrow$ `DocumentTransformer` (`TokenTextSplitter`, `KeywordMetadataEnricher`, `SummaryMetadataEnricher`) $\rightarrow$ `DocumentWriter`.
- **Embeddings & `VectorStore`:** `EmbeddingModel` abstractions, PGvector/Qdrant/Redis/Oracle integrations, and portable metadata filter expressions (`Filter.Expression`).
- **Modular RAG (`RetrievalAugmentationAdvisor`):** Moving beyond basic `QuestionAnswerAdvisor` to composable pre-retrieval (`RewriteQueryTransformer`, `MultiQueryExpander`), retrieval (`VectorStoreDocumentRetriever`), and post-retrieval query augmentation.

##### Module 5: Tool Calling, Model Context Protocol (MCP) & Agents
- **Tool Calling & `ToolCallingAdvisor`:** Defining `@Tool` and `@ToolParam` methods, passing secure server-side `ToolContext`, configuring `maxToolCalls` limits on `ToolCallingAdvisor` to prevent infinite loops, and dynamic tool discovery (`ToolSearchTool`).
- **Model Context Protocol (MCP):** Spring AI MCP Client & Server Boot Starters, STDIO vs. Streamable-HTTP transports, declarative `@McpTool` / `@McpResource` / `@McpPrompt` annotations, and OAuth-based MCP security.
- **Agentic Workflows & Mermaid Sequence:** Implementing Routing, Orchestrator-Workers, Evaluator-Optimizer loops, and Human-in-the-Loop (HITL) approval gates using recursive advisors.

##### Module 6: Testing, Evaluation & Production Hardening
- **Integration Testing with Testcontainers:** Deterministic JUnit 5 tests spinning up Ollama + PGvector/Qdrant via Spring Boot `@ServiceConnection`.
- **Automated AI Evals:** Using `RelevancyEvaluator` and `FactCheckingEvaluator` (LLM-as-a-Judge) inside CI/CD test suites.
- **Observability & FinOps:** Micrometer & OpenTelemetry GenAI semantic conventions, tracing `ChatClient` / `VectorStore` / `ToolCalling` spans, token cost tracking, and model tiering.
- **Security & Guardrails:** Spring Security integration, prompt injection defenses in RAG, and tenant isolation.

##### Module 7: Capstone Project – The Enterprise Autonomous Support & Knowledge Assistant
- **Project Architecture:** Building a production-grade, multi-tenant enterprise backend combining all learned concepts:
  - **Ingestion Pipeline:** Scheduled ETL batch jobs parsing company documentation into a PGvector vector store.
  - **Secure Chat Service:** `ChatClient` fluent API backed by `MessageChatMemoryAdvisor`, `RetrievalAugmentationAdvisor`, and custom PII-masking advisors.
  - **Agentic Tool Execution:** Declaring `@Tool` beans connected to internal ERP/CRM databases with secure `ToolContext` tenant isolation and MCP client integration.
  - **Observability & Testing:** Full Micrometer tracing and Testcontainers integration test suite validating correctness with `RelevancyEvaluator`.

---

#### 4. Signature Interactive Visualizations (Must-Build Components)
1. **Interactive Advisor Chain & Recursive Loop Visualizer (Modules 3 & 5):** Let learners reorder advisors (`SimpleLoggerAdvisor` $\rightarrow$ `MessageChatMemoryAdvisor` $\rightarrow$ `RetrievalAugmentationAdvisor` $\rightarrow$ `ToolCallingAdvisor`), step through requests forward/backward, and watch recursive tool loops.
2. **Gradle & Provider Config Switcher (Module 1):** Toggling between OpenAI, Anthropic, Google GenAI, Ollama, and Groovy DSL dynamically updates `build.gradle` and `application.yml` while showing the `ChatClient` Java code remains unchanged.
3. **Spring ETL & `TokenTextSplitter` Lab (Module 4):** Paste sample text, adjust `chunkSize`, `minChunkSizeChars`, and `keepSeparator`, and inspect resulting `List<Document>` objects and metadata.
4. **Java 25 `record` $\leftrightarrow$ JSON Schema Mapper (Module 2):** Edit a Java 25 `record` with nested records and `@JsonPropertyDescription` and inspect live generated JSON Schemas.

**Acknowledge this prompt, confirm Java 25, Gradle 9, and Spring AI 2.x baselines, and start immediately by asking me the 5 discovery questions.**