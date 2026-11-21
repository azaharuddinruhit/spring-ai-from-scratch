# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Astro 7 static site that teaches Spring AI: lessons in MDX, React islands for the sandboxes, Tailwind 4, Mermaid and Shiki.
`prompt.md` is the product spec (curriculum, lesson anatomy, must-build visualizers). The user chose: Astro + React + Tailwind,
Groovy DSL only, client-side simulations only (no backend), the emerald/slate docs theme, and module-by-module pacing.

## Commands

```bash
npm run dev        # dev server at http://localhost:4321/spring-ai-from-scratch/
npm run build      # astro check (TS + MDX types) then static build into dist/; this is what CI runs
npm run preview    # serve dist/
```

There are no unit tests. `npm run build` is the gate.

## Architecture

- The home hero `src/components/HeroTrace.astro` traces one request through the advisor order the course uses on 2.1.0 and links each step to its
  module. Keep its steps, order and snippets true to the API when lessons change.
- `src/data/curriculum.ts` is the single source of truth for module and lesson slugs and titles. A lesson is published when
  `src/content/lessons/<module-slug>/<lesson-slug>.mdx` exists. The MDX frontmatter holds only `description`.
- `src/data/versions.ts` pins the taught stack (Java 25, Boot 4.2.0, Spring AI 2.1.0, Gradle 9.9.1). Generate build files with
  `buildGradle()` / `gradleDependencies()` from `src/data/snippets.ts` instead of hard-coding versions in MDX.
- Lesson sections, in order: `## 1. Spring mental model`, `## 2. Interactive sandbox`, `## 3. Idiomatic Java 25 & Gradle 9 code`,
  `## 4. Production gotchas & security`, `## Recap`. The right-hand TOC lists the h2 headings.
- Reading time: `src/lib/section-reading-time.mjs` is a Sätteri mdast plugin (Astro 7's default Markdown processor, set in
  `astro.config.mjs`; remark plugins don't run without `@astrojs/markdown-remark`). It counts each h2 section at 200 words and
  20 code lines a minute, rounds up, puts a `.section-time` label under the heading and passes `sectionMinutes` to `LessonLayout`
  for the "On this page" list. Sandboxes count only their surrounding text.
- MDX components: `Mermaid` (renders client-side and re-renders on `themechange`), `CodeFile` (the code viewer), `Gotcha`
  (`kind`: reliability | security | cost | migration) and `MoreGotchas`: section 4 shows the three most important gotchas
  (security and money first) and wraps the rest in `<MoreGotchas>` (closed; left out of reading time). Keep that when adding one.
- Lessons that go further than a first pass needs have `deepDive: true` in `curriculum.ts`: a muted "Deep dive" tag in the
  sidebar and course list and a note in the lesson header. Core is the default and unmarked.
- Code viewer: every lesson code block goes inside `CodeFile`: the file name and an icon-only copy button (`.copy-btn`, shared with
  the sandboxes through `CopyButton`) above a 6px code box with line numbers. Line numbers are CSS counters, so copying never includes
  them. Mark key lines with fence meta (```java {12-14}) or the `lines` prop when passing `code`. A file of 25+ lines with key lines opens
  folded to them (3 lines of context; runs of 4+ hidden lines become "⋯ N lines" gap rows; "Show full file" in the title line),
  by the rule in `src/lib/code-fold.mjs`, which `section-reading-time.mjs` also uses to count only visible lines. Choose key
  lines with that in mind: they decide what a reader sees first. Themes and transformers live in
  `shiki.config.mjs`, which both Markdown fences and `src/lib/highlight.ts` use: Catppuccin Latte with every colour under 4.6:1 darkened
  in OKLCH (`LATTE_DARKENED`) on `#f8fafc`, and Mocha on slate-800 in dark mode. Fences render as `pre.astro-code` and snippets as
  `pre.shiki`, so code CSS targets `pre:is(.shiki, .astro-code)`. Box colours are `--code-*` variables in `global.css`. The font is
  JetBrains Mono with ligatures off, so code shows exactly as typed. All scrollbars are thin and themed (`--scrollbar`; code boxes use
  the code palette).
- Project tree: `<ProjectTree />` sits right under every lesson's `## 3.` heading (templates too), closed by default. `src/lib/project-tree.ts` builds it from
  `CodeFile` titles: this lesson's files are linked and marked new or changed (a title note such as "(additions)", or the path in an
  earlier lesson of the same app); earlier lessons' files are muted. Modules 2-6 are one app (`support`, plus `shipping` from the
  Java package); each Module 1 lesson and each of the four 2.1 lessons (`standalone: true`) stands alone. `CodeFile` ids come from `codeFileAnchor()` (the nth block for a path
  gets `-n`), keyed by the page `Request` on `globalThis`, because Astro loads `CodeFile` as more than one module instance per page.
  Give every `CodeFile` a real path title, so the tree stays right.
- Islands live in `src/components/islands/` and share `LabFrame`, `Pill` and `CodeView`. Code an island shows that is static per variant is
  highlighted at build time in an Astro wrapper (see `ProviderSwitcherLab.astro`), so islands don't ship Shiki. Code an island builds
  at runtime goes through `CodeView` with `lang` (`java`, `sql` or `json`), or `CodeEditor` for editable code: `src/lib/code-tokens.ts`
  colours it with Shiki's theme colours (99.5% of characters agree with Shiki on the lesson Java). Never show Java uncoloured. `CodeView` with `lang="json"` indents JSON itself (`prettyJson`), so pass JSON compact or
  pretty; write JSON inside lesson Java text blocks indented too.
- `src/lib/` holds exact TypeScript ports used by the Module 4 labs: `token-text-splitter.ts` (`TokenTextSplitter.doSplit`, with
  `js-tiktoken` cl100k_base loaded by dynamic import so only that lab fetches the 1 MB rank table) and `vector-filter.ts` (the
  `Filter.Expression` text parser, `PgVectorFilterExpressionConverter` and a jsonpath evaluator with PostgreSQL semantics). Both
  were diffed against the 2.0.2 classes (and the evaluator against PostgreSQL 17) with zero differences, and 2.1.0 gives the same
  output (only the parser gained a depth limit of 100); re-check them on upgrade.
- The site is deployed under the `/spring-ai-from-scratch` base path. Build internal links with `withBase()` / `lessonHref()` from `src/lib/course.ts`.
- Phones: zoom is off by the owner's decision (viewport `user-scalable=no`, `touch-action: pan-x pan-y` on `html, body`, and an inline
  `gesturestart` handler in `BaseLayout.astro` for Safari). Don't turn it back on unasked. Inline code wraps (`overflow-wrap: anywhere`)
  and titles render through `Breakable`, which lets long CamelCase names wrap at their capitals, so nothing widens the page; check new pages at 320px and 390px for horizontal overflow.
- Dark mode is a `dark` class on `<html>`. Shiki uses dual themes through CSS variables in `src/styles/global.css`.

## Product and design

- `PRODUCT.md` records who the course is for, what it promises and what must never be claimed (no invented testimonials or numbers).
- `BACKLOG.md` lists saved future tasks (learning-curve fixes, open checks). Start one only when the owner asks.
- `UPGRADE-2.1.md` holds the agreed plan and checklist for moving the course to Spring AI 2.1 (branch `spring-ai-2.1`). Keep it
  up to date as steps finish.
- `DESIGN.md` is the visual system ("The Running Call"): tokens in its frontmatter, rules in its body, and a sidecar in
  `.impeccable/design.json`. Follow it for any UI change and update it when the system changes.

## Content accuracy

Lesson code must match the real Spring AI 2.0.x API. Verify names against the jars or the reference docs before writing them. Known 2.x facts used so far:
options are immutable (`mutate()`, no `copy()`); `ChatClient.options()` / `defaultOptions()` take a builder; `ToolCallingAdvisor` is
auto-registered at `HIGHEST_PRECEDENCE + 300`, after the session turn (`+ 200`) and the course's memory (`+ 210`) and before RAG and logging (order 0); tool limits are `spring.ai.tools.limits.*` / `maxCallsPerTool` (there is no `maxToolCalls`);
advisors use `ChatClientRequest` / `ChatClientResponse` (not `AdvisedRequest`); the `.options` segment is gone from property keys;
a session id (`SessionAdvisors.session(id)`) is mandatory for session memory; MCP annotations live in `org.springframework.ai.mcp.annotation`.
Providers on 2.1.0: Anthropic moves to `anthropic-java` 3.8 (API version 2026-10-21) and drops `temperature`, `topP` and `topK`
with a WARN (setters and properties deprecated for removal), so Module 1 shows `maxTokens` and `stopSequences`; prompt options
still replace the model defaults in `ChatModel.call`; `DeepSeekAssistantMessage` is deprecated for removal (use
`AssistantMessage.getReasoning()`).
Structured output (verified by running the 2.0.2 classes; the 2.1.0 converters are byte-identical on the same victools 5.0.0):
`entity(Type, spec -> spec.useProviderStructuredOutput().validateSchema())`;
`ChatModelCallAdvisor` appends `getFormat()` to the last user message, or sets `outputSchema` when the options implement
`StructuredOutputChatOptions` (OpenAI, Anthropic, Google GenAI, Mistral AI, Ollama, Bedrock; not DeepSeek) and silently falls back otherwise;
`StructuredOutputValidationAdvisor` sits at `LOWEST_PRECEDENCE - 2000`, retries 3 times by default and returns the last reply when they
run out (since 2.1 it stops early on a guardrail refusal or a `FILTERED` finish reason, and `entity()` throws
`GuardrailRefusalException` / its parent `ContentFilteredException` instead of converting); schema properties are sorted by name unless `@JsonPropertyOrder`, and a bare `@JsonProperty("x")` makes the field optional.
`RecordSchemaLab` reproduces the generator exactly; re-check it against `BeanOutputConverter.getJsonSchema()` when Spring AI is upgraded.
Advisors and memory (verified by running the 2.1.0 classes, equal orders also on 2.0.2): advisors with equal orders run in reverse
registration order before `ToolCallingAdvisor` and in registration order after it (a lambda `ChatModel` has no tool loop and
shows only the reverse rule); advisors ordered after `ToolCallingAdvisor` run once per model call, and advisors before it see the
summed usage (a 2.0.1 change, the same on 2.1); `SimpleLoggerAdvisor` and `SafeGuardAdvisor` default to order 0, the RAG
advisors to 0; `SafeGuardAdvisor` lower-cases `Prompt.getContents()` (system and memory included), uses `contains` and marks its
reply with finish reason `guardrailRefusal` (`GuardrailRefusal.isRefusal`); `SimpleLoggerAdvisor` logs at DEBUG and its request
line includes the context map; `BaseAdvisor` runs `before` on `boundedElastic` for streams and `after` only on the chunk with a
finish reason; `stream()` skips `CallAdvisor`-only advisors. Session memory (2.1, replacing `ChatMemory`, `MessageWindowChatMemory`,
`MessageChatMemoryAdvisor` and `ChatMemoryRepository`, all deprecated for removal): model starters don't configure it; define a
`SessionService` over `InMemorySessionRepository` or add `spring-ai-starter-model-session-jdbc` (brings `spring-ai-session-advisor`;
`SessionServiceAutoConfiguration` needs one `SessionRepository`); `SessionAdvisors.builder(sessionService)` adds
`SessionTurnAdvisor` (`+ 200`) and `SessionMemoryAdvisor` (default `+ 1000`, inside the tool loop, so it stores every tool round;
the course orders it `+ 210`); the memory advisor sends system + the events its `EventFilter` picks (default `all()`;
`lastN(n)` extends back to a turn start) + the new message, and stores the message and the reply; system messages aren't stored
(`allow-system-messages` false); a missing id throws `IllegalStateException: No session ID found in advisor context`; JDBC ids
are `VARCHAR(255)` in `AI_SESSION` / `AI_SESSION_INDEX` / `AI_SESSION_EVENT` (cascade delete), `initialize-schema` defaults to
`embedded`, and the repository connects at startup to detect the dialect; `time-to-live` defaults to 60d from creation, but
expiry is only a date: `findById` and the advisors still use an expired session until `deleteExpiredSessions` removes it (no
automatic sweep); metadata passed under `SESSION_METADATA_CONTEXT_KEY` applies only when the session is created, and
`PRINCIPAL_NAME` is always indexed for `findByMetadata`; with memory at `+ 210` a plain tool loop stores only the question and the
answer. `VectorStoreChatMemoryAdvisor` (`spring-ai-vector-store-advisor`, top-K 20, order `+ 200`) is not deprecated.
`AdvisorChainLab`, `GuardrailLab` and `ChatMemoryLab` simulate exactly these rules; update them together with the lessons.
RAG and ETL (verified by running the 2.0.2 classes, filters also on PostgreSQL 17 with PgVector; on 2.1.0 the splitter and
text formatter give identical output, the RAG classes are unchanged, the filter parser adds a depth limit of 100 counting AND/OR,
and `PgVectorStore` asks the model for dimensions only when it creates its table, otherwise reading the column size): `TokenTextSplitter` defaults are
800 / 350 / 5 / 10000 / keepSeparator true (2.1 adds `withChunkOverlap`, default 0), its constructors are deprecated (use the builder), `keepSeparator(false)` replaces
`System.lineSeparator()`, and chunks get `parent_document_id`, `chunk_index` and `total_chunks`; `PagePdfDocumentReader` keeps the
layout spaces and `ExtractedTextFormatter` needs `overrideLineSeparator("
")` on Windows; `MarkdownDocumentReader` splits code
blocks and blockquotes into their own documents by default; `Document` ids are random, so re-ingesting duplicates (the lesson tags
a revision, adds, then deletes the old revision); `OpenAiEmbeddingModel` embeds metadata unless `metadata-mode: none`;
`PgVectorStore` `initialize-schema` defaults to false, embeds "Test String" without `dimensions` (on 2.1 only when it creates the table), and HNSW fails above
2000 dimensions; filter text: AND binds tighter than OR, `NOT` takes everything to its right, a lone `!` is skipped by the lexer;
the builder's `and(x, or(y, z))` loses its parentheses in PgVector SQL unless wrapped in `group()`, and builder values are escaped
while concatenated text is injectable. `RetrievalAugmentationAdvisor` defaults to order 0 (the lesson uses `+ 225`, after memory and
before tools); a request's `FILTER_EXPRESSION` replaces the retriever's filter; `ContextualQueryAugmenter` replaces the question
with a refusal instruction when no documents come back unless `allowEmptyContext(true)`; `MultiQueryExpander` falls back to the
original query when the line count is wrong, and a duplicate query throws `IllegalStateException: Duplicate key`; the semantic cache
from Module 3 tags its entries `kind: semantic-cache` and filters on it because it shares the knowledge base's store.
`TextSplitterLab`, `VectorSearchLab` and `RagPipelineLab` simulate these rules (their scores and model replies are invented).
Tools, MCP and workflows (verified by running the 2.0.2 classes; repositories also on PostgreSQL 17): a `ToolContext` parameter is
left out of the tool schema; `DefaultToolExecutionExceptionProcessor` sends the exception message to the model and rethrows
`ClientAuthorizationException`; `spring.ai.tools.limits` defaults are 40 per tool and 150 in total, `-1` disables, YAML map keys keep
their case; `on-limit-exceeded: THROW` (default) returns one generation with finish reason `toolCallLimitExceeded`
(`ToolCallLimitExceededException.FINISH_REASON`) and the limit message as text, so the service must check it (limit N means N + 1 model
calls); `defaultToolCallbacks`/`toolCallbacks` are deprecated for removal, `defaultTools(Object...)` takes `@Tool` objects, callbacks
and providers; `ToolSearchToolCallingAdvisor` (`spring-ai-starter-tool-search-advisor`,
`spring.ai.chat.client.tool-search-advisor.enabled`) needs `CONVERSATION_ID`; `toolExecutionEligibilityChecker` leaves an unanswered
tool call in memory. MCP: a WebMVC server without `spring.ai.mcp.server.protocol: STREAMABLE` starts SSE (client gets 404 on
`POST /mcp`); `@McpTool` hints default to readOnly false, destructive true, idempotent false, openWorld true; `@PreAuthorize` on a tool
gives `isError` "Access Denied"; a bad token fails `initialize` with `McpHttpClientTransportAuthorizationException`; MCP tools are not
added to `ChatClient` automatically; the default `ToolContextToMcpMetaConverter` copies the whole tool context into `_meta` (`noOp()`);
`initialized: false` starts without the server but then every chat fails, because `ChatClient` lists provider tools per request
(the lesson wraps the provider in `BestEffortToolCallbacks`); duplicate tool names get `alt_1_`; `@McpPrompt` returning `String` gives
an ASSISTANT message; STDIO servers need `stdio=true`, no web app, no banner and an empty console log pattern. JDBC: the PostgreSQL
driver can't bind an enum or an `Instant`, so `JdbcClient.paramSource(record)` fails; bind `.name()` and `OffsetDateTime`.
`ToolLoopLab`, `McpLab`, `RefundApprovalLab` and `TicketWorkflowLab` simulate these rules (model replies invented).
Module 5 lesson code lives in `lesson-src/module-5/code` (62 tests; `lesson1/`, `lesson2/` hold the earlier versions of files the later
lessons change). Lessons are generated from `lesson-src/module-5/templates/*.mdx` with `python lesson-src/module-5/assemble.py <template> <out> lesson-src/module-5/code`,
which turns `@@CODE file | regex; regex@@` lines into fenced code with those lines highlighted. Edit the template, not the MDX.
`lesson-src/module-5/run-tests.sh` compiles that code and runs its tests (it needs a local `cp.arg` classpath; see its header).
Testing and evals (Module 6, verified; details in `lesson-src/module-6/findings.md`): there is no PgVector `@ServiceConnection`
factory (Boot's PostgreSQL one covers pgvector); the Ollama one sets only the base URL; `spring.ai.ollama.init.pull-model-strategy`
defaults to `never` and `init.timeout` to 5m; `OllamaContainer` requests a GPU when Docker lists an `nvidia` runtime, which fails
on Docker Desktop/WSL without one; `RelevancyEvaluator` and `FactCheckingEvaluator` pass only on a bare "yes" (case and surrounding
space ignored); `FactCheckingEvaluator` never sends the question; the RAG advisor puts retrieved documents in the `ChatResponse`
metadata under `DOCUMENT_CONTEXT`; a registered Gradle `Test` task without `testClassesDirs`/`classpath` is `NO-SOURCE` and green.
The first full-app run found that the Module 5 app refused order questions (empty-context augmenter), fixed in Module 5 Tool Calling with
`allowEmptyContext(true)` plus a system-prompt rule; `qwen2.5:1.5b` never calls tools, `llama3.2:3b` does. Module 6 code lives in
`lesson-src/module-6` (same workflow as Module 5; `// probe-only` lines are left out of lessons). `AnswerCheckLab` shows recorded
`llama3.2:3b` answers and 3B-judge replies, nothing invented.
The four 2.1 lessons (`standalone: true` in the curriculum; written on Spring AI 2.1.0-RC2, re-run on 2.1.0 / Boot 4.2.0; plan and
checklist in `UPGRADE-2.1.md`): code in `lesson-src/preview-2.1/code/<lesson>`, same template workflow as Module 5 (`assemble.py`,
`run-tests.sh <lesson>`; `*IT` tests are tagged `ollama` and run only when selected), facts in `lesson-src/preview-2.1/findings.md`. Each 2.1
lesson is its own project. Never put the Qwen server's address, key or model names in the repo; probes read `QWEN_*` env vars and the
lessons say "a 27B Qwen 3 reasoning model". Decision models (Lesson 2.3, verified on RC2 with `d1-omni:600m` in Ollama 0.40.16):
`OllamaDecisionModel` calls `/v1/systemone`; `spring.ai.model.decision` defaults to ollama in the Ollama starter and to openai in the
OpenAI starter, so both starters without the property fail with `NoUniqueBeanDefinitionException`; answers are deterministic; several
questions share one call (72 prompt tokens for one, 284 for three, 0 completion); the first call takes about 10 s; `isYes(threshold)`
is inclusive and `DEFAULT_THRESHOLD` is 0.5; `getConfidence()` is reported by the endpoint, not the top probability; `whenYes`/`whenNo`
took a blatant injection from 0.113 to 0.9998 and a benign mention to 0.794 (the router uses 0.9); a blank text throws
`IllegalArgumentException: text cannot be null or empty`; no refusal was ever observed. `DecisionLab` replays
`src/data/recorded-decisions.json` (from `probes/recording-to-sandbox.py`) with `TicketRouter`'s rules; update them together.
Decision filter and reranker (Lesson 4.4, verified on RC2): `DecisionDocumentFilter` checks injection `>`, contradiction `>`
(kept as CONFLICTING), relevance `<`, evidence `>` in that order, all strict (`Policy.defaults()` 0.7/0.7/0.45/0.55); its timeout
(1 min) covers the batch and by default passes unscreened passages through (`failClosed(true)` drops them); the reranker keeps
passages scored at or above `minimumScore`, has no `topK` by default, and on timeout keeps unscored ones (no score, no minimum check,
still counted in `topK`). With `d1-omni:600m` the defaults kept nearly every passage as CONFLICTING and the injection question missed
both planted passages; the lesson sets contradiction 1.0, reranker top 3 at 0.4, fail closed. `ScreeningLab` replays
`src/data/recorded-rag.json` (from `probes/rag-to-sandbox.py`) with the filter's rule order; update them together.
Tool search (Lesson 5.4, verified on RC2; 2.0.2 had the advisor and the regex, Lucene and vector indexes, 2.1 adds
`DecisionToolIndex`): `tool-search-advisor.enabled` replaces the `ToolCallingAdvisor.Builder`; `tool-index-type` defaults to regex;
the session key defaults to `chat_memory_conversation_id` (`ChatMemory.CONVERSATION_ID`, deprecated for removal) and a missing one
throws `IllegalArgumentException`; every request starts with `toolSearchTool` only; the model's `maxResults` wins over `max-results`
(fallback 10), and 0 makes Lucene throw and the advisor fail the request (the app's `BoundedToolIndex` clamps it); Lucene drops
scores under 0.25 and logs every hit at INFO; vector has no cut-off. `DecisionToolIndex` asks `best_tool` and `any_tool_applies`,
returns nothing below `applicability-threshold` (0.5) and otherwise every option above 0; with `d1-omni:600m` it scored 0.07-0.31
and found no tool, favoured the first listed tool and varied between runs. With ten tools, unlimited searches cost more prompt
tokens than sending all tools (17,171 vs 21,886-23,399 over six requests; Lucene with 3 results 15,780). `llama3.2:3b` found
the tool and didn't call it (0 of 5), so `SupportChatIT` checks the call with a spy and passed with the 27B model. `ToolSearchLab`
replays `src/data/recorded-tool-search.json` (from `probes/tool-search-to-sandbox.py`); update them together.
Message parts (Lesson 1.5, verified on RC2): parts are records in `chat.messages.part`; `MessagePart` isn't sealed (a `switch`
needs `default`) and `getParts()` is on `AbstractMessage`, not `Message`; `OpenAiChatModel` reads `reasoning_content`, then
`reasoning` (Ollama `/v1`), into a `ReasoningPart` (also still the `reasoningContent` metadata entry), and replays it as
`reasoning_content` unless `replay-reasoning-content` is false; `ChatClient` returns only the last tool-loop call's message, so
the reasoning before a tool call never reaches the caller; `extra-body` set as a property binds `enable_thinking` as the string
`"false"` (thinking stays on), a Java `Map` sends a boolean; streams carry partial parts with `partIndex`/`partial`, and
`content()` holds no reasoning; `deepseek-r1:1.5b` on Ollama reasons but ignored the tool. `MessagePartsLab` shows
`src/data/recorded-parts.json` (from `probes/parts-to-sandbox.py`); update them together.
Observability (Module 6 Lesson 2, verified): `spring-boot-starter-opentelemetry` alone exports traces and metrics over OTLP (no
actuator); sampling defaults to 0.1; traces export only once `management.opentelemetry.tracing.export.otlp.endpoint` is set;
spans are `spring.ai.chat.client`, `spring.ai.advisor`, `gen_ai.client.operation`, `db.vector.client.operation`, `spring.ai.tool`;
`gen_ai.client.token.usage` has no cache split (cached reads are only the span attribute `gen_ai.usage.cache_read.input_tokens`);
`log-prompt`/`log-completion` log at INFO with the trace id, `spring.ai.tools.observations.include-content` adds tool arguments and
results to spans, and `db.vector.query.content` is always recorded. `CompressionQueryTransformer` calls the model for every
question (the RAG history is the whole prompt, never empty); Lesson 2 rewrites only follow-ups, on `support.knowledge.rewrite-model`.
`TraceLab` shows two recorded runs (2.1.0, the 27B Qwen model for chat and rewrite) from `src/data/recorded-traces.json` (generated by
`lesson-src/module-6/probes/trace-to-sandbox.py`, which drops the HTTP client spans `http.client.requests` and `okhttp.requests`).
Re-recordings run the probes with chat on the OpenAI starter pointed at the `QWEN_*` server; the converters replace the alias
with `qwen-27b` and refuse to write if a server value remains. A reasoning model's output tokens include its reasoning.
Security (Module 6 Lesson 3, verified on 2.1.0): session memory stores the redacted question and the reply (a paused
confirmation stores the assistant tool call with empty text); the owner is session metadata, so erasure (`DELETE /api/chats`) uses
`findByMetadata` and retention a nightly `deleteExpiredSessions`. In the attacks recorded with the 27B Qwen model the model refused
four and obeyed the forced refund (called `refundOrder` for the full amount); the confirmation held, so no refund and no payment.
`SupportSecurityIT` asserts only what the code allowed; mutation runs (2.0.2) showed its redaction and staff-filter tests fail
when those boundaries are removed. `AttackLab` shows the recording from `src/data/recorded-attacks.json`.

MDX pitfall: `{` and `<` in prose are parsed as JSX. Put generics and braces inside backticks.

## CI

`.github/workflows/deploy.yml` runs `npm ci && npm run build` on pull requests and pushes. On `main` it deploys `dist/` to GitHub Pages
(Pages source must be set to GitHub Actions).

Versioning: `VERSION` holds `major.minor`. Each deploy sets `SITE_VERSION` to that plus the workflow's run number (so 1.0.37), and
the header pill shows it (`SITE_VERSION` in `src/data/versions.ts`); other builds show "dev". The patch bumps itself on every deploy
and can skip numbers (pull request runs use run numbers too). Edit `VERSION` only for a minor (new module or feature) or major release.
