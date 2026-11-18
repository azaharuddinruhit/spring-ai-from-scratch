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

- The home hero `src/components/HeroTrace.astro` traces one request through the real 2.0.2 advisor order and links each step to its
  module. Keep its steps, order and snippets true to the API when lessons change.
- `src/data/curriculum.ts` is the single source of truth for module and lesson slugs and titles. A lesson is published when
  `src/content/lessons/<module-slug>/<lesson-slug>.mdx` exists. The MDX frontmatter holds only `description`.
- `src/data/versions.ts` pins the taught stack (Java 25, Boot 4.1.2, Spring AI 2.0.2, Gradle 9.9.1). Generate build files with
  `buildGradle()` / `gradleDependencies()` from `src/data/snippets.ts` instead of hard-coding versions in MDX.
- Lesson sections, in order: `## 1. Spring mental model`, `## 2. Interactive sandbox`, `## 3. Idiomatic Java 25 & Gradle 9 code`,
  `## 4. Production gotchas & security`, `## Recap`. The right-hand TOC lists the h2 headings.
- Reading time: `src/lib/section-reading-time.mjs` is a Sätteri mdast plugin (Astro 7's default Markdown processor, set in
  `astro.config.mjs`; remark plugins don't run without `@astrojs/markdown-remark`). It counts each h2 section at 200 words and
  20 code lines a minute, rounds up, puts a `.section-time` label under the heading and passes `sectionMinutes` to `LessonLayout`
  for the "On this page" list. Sandboxes count only their surrounding text.
- MDX components: `Mermaid` (renders client-side and re-renders on `themechange`), `CodeFile` (the code viewer), `Gotcha`
  (`kind`: reliability | security | cost | migration).
- Code viewer: every lesson code block goes inside `CodeFile`: the file name and an icon-only copy button (`.copy-btn`, shared with
  the sandboxes through `CopyButton`) above a 6px code box with line numbers. Line numbers are CSS counters, so copying never includes
  them. Mark key lines with fence meta (```java {12-14}) or the `lines` prop when passing `code`. Themes and transformers live in
  `shiki.config.mjs`, which both Markdown fences and `src/lib/highlight.ts` use: Catppuccin Latte with every colour under 4.6:1 darkened
  in OKLCH (`LATTE_DARKENED`) on `#f8fafc`, and Mocha on slate-800 in dark mode. Fences render as `pre.astro-code` and snippets as
  `pre.shiki`, so code CSS targets `pre:is(.shiki, .astro-code)`. Box colours are `--code-*` variables in `global.css`. The font is
  JetBrains Mono with ligatures off, so code shows exactly as typed. All scrollbars are thin and themed (`--scrollbar`; code boxes use
  the code palette).
- Islands live in `src/components/islands/` and share `LabFrame`, `Pill` and `CodeView`. Code an island shows that is static per variant is
  highlighted at build time in an Astro wrapper (see `ProviderSwitcherLab.astro`), so islands don't ship Shiki. Code an island builds
  at runtime goes through `CodeView` with `lang` (`java`, `sql` or `json`), or `CodeEditor` for editable code: `src/lib/code-tokens.ts`
  colours it with Shiki's theme colours (99.5% of characters agree with Shiki on the lesson Java). Never show Java uncoloured. `CodeView` with `lang="json"` indents JSON itself (`prettyJson`), so pass JSON compact or
  pretty; write JSON inside lesson Java text blocks indented too.
- `src/lib/` holds exact TypeScript ports used by the Module 4 labs: `token-text-splitter.ts` (`TokenTextSplitter.doSplit`, with
  `js-tiktoken` cl100k_base loaded by dynamic import so only that lab fetches the 1 MB rank table) and `vector-filter.ts` (the
  `Filter.Expression` text parser, `PgVectorFilterExpressionConverter` and a jsonpath evaluator with PostgreSQL semantics). Both
  were diffed against the 2.0.2 classes (and the evaluator against PostgreSQL 17) with zero differences; re-check them on upgrade.
- The site is deployed under the `/spring-ai-from-scratch` base path. Build internal links with `withBase()` / `lessonHref()` from `src/lib/course.ts`.
- Phones: zoom is off by the owner's decision (viewport `user-scalable=no`, `touch-action: pan-x pan-y` on `html, body`, and an inline
  `gesturestart` handler in `BaseLayout.astro` for Safari). Don't turn it back on unasked. Inline code wraps (`overflow-wrap: anywhere`)
  so nothing widens the page; check new pages at 320px and 390px for horizontal overflow.
- Dark mode is a `dark` class on `<html>`. Shiki uses dual themes through CSS variables in `src/styles/global.css`.

## Product and design

- `PRODUCT.md` records who the course is for, what it promises and what must never be claimed (no invented testimonials or numbers).
- `BACKLOG.md` lists saved future tasks (learning-curve fixes, open checks). Start one only when the owner asks.
- `DESIGN.md` is the visual system ("The Running Call"): tokens in its frontmatter, rules in its body, and a sidecar in
  `.impeccable/design.json`. Follow it for any UI change and update it when the system changes.

## Content accuracy

Lesson code must match the real Spring AI 2.0.x API. Verify names against the jars or the reference docs before writing them. Known 2.x facts used so far:
options are immutable (`mutate()`, no `copy()`); `ChatClient.options()` / `defaultOptions()` take a builder; `ToolCallingAdvisor` is
auto-registered at `HIGHEST_PRECEDENCE + 300`, after memory advisors (`+ 200`) and before RAG and logging (order 0); tool limits are `spring.ai.tools.limits.*` / `maxCallsPerTool` (there is no `maxToolCalls`);
advisors use `ChatClientRequest` / `ChatClientResponse` (not `AdvisedRequest`); the `.options` segment is gone from property keys;
`ChatMemory.CONVERSATION_ID` is mandatory for memory advisors; MCP annotations live in `org.springframework.ai.mcp.annotation`.
Structured output (verified by running the 2.0.2 classes): `entity(Type, spec -> spec.useProviderStructuredOutput().validateSchema())`;
`ChatModelCallAdvisor` appends `getFormat()` to the last user message, or sets `outputSchema` when the options implement
`StructuredOutputChatOptions` (OpenAI, Anthropic, Google GenAI, Mistral AI, Ollama) and silently falls back otherwise;
`StructuredOutputValidationAdvisor` sits at `LOWEST_PRECEDENCE - 2000`, retries 3 times by default and returns the last reply when they
run out; schema properties are sorted by name unless `@JsonPropertyOrder`, and a bare `@JsonProperty("x")` makes the field optional.
`RecordSchemaLab` reproduces the generator exactly; re-check it against `BeanOutputConverter.getJsonSchema()` when Spring AI is upgraded.
Advisors and memory (verified by running the 2.0.2 classes): equal orders run in reverse registration order; advisors ordered after
`ToolCallingAdvisor` run once per model call, and advisors before it see the summed usage; `SimpleLoggerAdvisor` and `SafeGuardAdvisor`
default to order 0, the RAG advisors to 0; `SafeGuardAdvisor` lower-cases `Prompt.getContents()` (system and memory included) and uses
`contains`; `SimpleLoggerAdvisor` logs at DEBUG and its request line includes the context map; `BaseAdvisor` runs `before` on
`boundedElastic` for streams and `after` only on the chunk with a finish reason; `stream()` skips `CallAdvisor`-only advisors.
`MessageChatMemoryAdvisor` sends system + stored window + the new message, then saves the last user or tool message and the reply;
`MessageWindowChatMemory` defaults to 20 messages (no property; define the bean), keeps system messages and trims on save; every model
starter auto-configures it over `InMemoryChatMemoryRepository`; a missing conversation id throws
`IllegalArgumentException: conversationId cannot be null`; JDBC `conversation_id` is `VARCHAR(36)` and
`spring.ai.chat.memory.repository.jdbc.initialize-schema` defaults to `embedded`; `VectorStoreChatMemoryAdvisor` lives in
`spring-ai-vector-store-advisor` (top-K 20, order `+ 200`); there is no `PromptChatMemoryAdvisor` in 2.0.2.
`AdvisorChainLab`, `GuardrailLab` and `ChatMemoryLab` simulate exactly these rules; update them together with the lessons.
RAG and ETL (verified by running the 2.0.2 classes, filters also on PostgreSQL 17 with PgVector): `TokenTextSplitter` defaults are
800 / 350 / 5 / 10000 / keepSeparator true, its constructors are deprecated (use the builder), `keepSeparator(false)` replaces
`System.lineSeparator()`, and chunks get `parent_document_id`, `chunk_index` and `total_chunks`; `PagePdfDocumentReader` keeps the
layout spaces and `ExtractedTextFormatter` needs `overrideLineSeparator("
")` on Windows; `MarkdownDocumentReader` splits code
blocks and blockquotes into their own documents by default; `Document` ids are random, so re-ingesting duplicates (the lesson tags
a revision, adds, then deletes the old revision); `OpenAiEmbeddingModel` embeds metadata unless `metadata-mode: none`;
`PgVectorStore` `initialize-schema` defaults to false, embeds "Test String" at startup without `dimensions`, and HNSW fails above
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
Module 5 lesson code lives in `lesson-src/module-5/code` (63 tests; `lesson1/`, `lesson2/` hold the earlier versions of files the later
lessons change). Lessons are generated from `lesson-src/module-5/templates/*.mdx` with `python lesson-src/module-5/assemble.py <template> <out> lesson-src/module-5/code`,
which turns `@@CODE file | regex; regex@@` lines into fenced code with those lines highlighted. Edit the template, not the MDX.
`lesson-src/module-5/run-tests.sh` compiles that code and runs its tests (it needs a local `cp.arg` classpath; see its header).

MDX pitfall: `{` and `<` in prose are parsed as JSX. Put generics and braces inside backticks.

## CI

`.github/workflows/deploy.yml` runs `npm ci && npm run build` on pull requests and pushes. On `main` it deploys `dist/` to GitHub Pages
(Pages source must be set to GitHub Actions).

Versioning: `VERSION` holds `major.minor`. Each deploy sets `SITE_VERSION` to that plus the workflow's run number (so 1.0.37), and
the header pill shows it (`SITE_VERSION` in `src/data/versions.ts`); other builds show "dev". The patch bumps itself on every deploy
and can skip numbers (pull request runs use run numbers too). Edit `VERSION` only for a minor (new module or feature) or major release.
