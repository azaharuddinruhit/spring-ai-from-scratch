# Spring AI 2.1: preview lessons, then the full move

The plan for bringing Spring AI 2.1 into the course. It started from `prompt-updated.md` (the original request) and was settled
with the owner on 2026-11-19; where the two differ, this file wins. Work happens on the `spring-ai-2.1` branch. Tick items off as
they are done.

## Decisions

- **Two phases.** Phase 1 ships now, one lesson at a time: four new lessons on Spring AI 2.1.0-RC2, each marked as a preview.
  Each one is merged into `main` and deployed as soon as it is finished (the owner's standing approval). Phase 2 waits for GA:
  the existing lessons and the support app move to 2.1, and Session Memory replaces `ChatMemory`.
- **New content only, in its own lessons.** The 18 existing lessons stay on 2.0.2 / Boot 4.1.2 until phase 2. No page mixes the
  two stacks; an existing lesson gets at most a one-line pointer to the new lesson.
- **Each feature goes where a learner would look for it**, as the last lesson of that module (no "What's new" module):

  | Lesson | Covers | Sandbox |
  | --- | --- | --- |
  | 1.5 Message Parts & Reasoning | `getParts()`, `TextPart` / `ReasoningPart` / `ToolCallPart` / `ToolResultPart` / `MediaPart` / `UnknownPart`, `getReasoning()`, reasoning replayed across turns, through `OpenAiChatModel` on an OpenAI-compatible server | The parts of a recorded reply with reasoning and a tool call, in order |
  | 2.3 Decision Models | `DecisionModel`, `YesNoQuestion` / `ChoiceQuestion` / `ScoreQuestion`, thresholds, refusals, why not parse a chat reply | Decision Model & Threshold Simulator |
  | 4.4 Decision Filter & Reranker | `DecisionDocumentFilter` (injection, contradiction, relevance, evidence), `DecisionDocumentReranker`, fail open / closed, concurrency and virtual threads, filter before rerank | The filter policy over recorded scores |
  | 5.4 Tool Search & DecisionToolIndex | `ToolSearchToolCallingAdvisor` with the regex, Lucene, vector and decision indexes | Which tools each index picks for recorded questions |

  Each keeps the five-section layout. The 4.4 examples stand alone; the support app gets the filter in phase 2.
- **Preview marking.** A preview lesson says "Preview: Spring AI 2.1.0-RC2, Spring Boot 4.2.0-RC2" where the other lessons say
  "Written for …", and the course navigation marks it. Its build snippets use the preview pins.
- **Memory waits.** `ChatMemory`, `MessageChatMemoryAdvisor`, `MessageWindowChatMemory`, `ChatMemoryRepository` and
  `JdbcChatMemoryRepository` are deprecated for removal in RC2. Phase 1 leaves Module 3 and the support app alone; phase 2
  rewrites them for Session Memory.
- **Sandboxes show recorded runs only.** The simulator offers preset messages with probabilities recorded from `d1-omni:600m`;
  sliders re-route those real numbers. There is no free-text input, because the site has no model to score typed text and
  PRODUCT.md rules out invented numbers.
- **Models: no cloud keys, two local sources.**
  - Decisions: `d1-omni:600m` on Ollama only (the 2.1 default). The Qwen server has no `/v1/systemone` endpoint.
  - The owner's Qwen server (see "Machine and models") for: all of lesson 1.5; the chat side of 5.4 (the model that calls the
    tools `DecisionToolIndex` selects); the chat-model side wherever 2.3 or 4.4 compares a decision model with asking a chat
    model; and the phase 2 re-recordings of `TraceLab` and `AttackLab` (replacing `llama3.2:3b`).
  - Lessons name it generically: "a 27B Qwen 3 reasoning model", served through an OpenAI-compatible endpoint. The server's
    address, key and model aliases never appear in the repo or on the site; probes read them from environment variables
    (`QWEN_BASE_URL`, `QWEN_API_KEY`). Lesson code uses a placeholder base URL that a reader can point at Ollama's `/v1` or any
    OpenAI-compatible server.
  - Each lesson says which model produced its recordings and that another model may answer or score differently.
- **Versions.** `VERSION` goes to 1.6 when the first preview lesson ships and to 2.0 when phase 2 merges.
- **`@tailwindcss/typography` stays at 0.5.4** (the owner's choice). It drops 0.5.20's `th, td { text-align: start }`, `figure`,
  `kbd`, `dl` and `picture` rules, and its `not-prose` covers only the element's children. Fix what that changes in
  `global.css` (step 1).

## Checked in the RC2 jars (2026-11-19)

From Maven Central and the class files. Step 1 then ran the classes; the results, recordings and anything that
corrects this list are in `lesson-src/preview-2.1/findings.md`.

- **Spring AI 2.1.0-RC2 is built on Spring Boot 4.2.0-RC2** (2.0.2 was built on 4.1.2), so the preview lessons pin Boot
  4.2.0-RC2. Both are on Maven Central; no milestone repository is needed.
- New artifacts: `spring-ai-session`, `spring-ai-session-advisor`, `spring-ai-session-jdbc`,
  `spring-ai-starter-model-session-jdbc`, `spring-ai-systemone`, `spring-ai-autoconfigure-model-decision-observation`, and
  Google GenAI transcription and TTS.
- `org.springframework.ai.decision` (in `spring-ai-model`): `DecisionModel`, `DecisionPrompt`, `DecisionResponse`, `DecisionResult`,
  `DecisionOptions`; questions `YesNoQuestion`, `ChoiceQuestion`, `ScoreQuestion`, `ScoreLevel`; answers `YesNoAnswer`,
  `ChoiceAnswer`, `ScoreAnswer`, `RefusalAnswer`; inputs `TextInput`, `ConversationInput`, `FieldsInput`.
- `OllamaDecisionModel` (in `spring-ai-ollama`) calls Ollama's `/v1/systemone` endpoint through the TypeSafe Java SDK
  (`org.springaicommunity.typesafe`). Properties `spring.ai.ollama.decision.*`; the selector `spring.ai.model.decision` exists.
- `DecisionDocumentFilter` and `DecisionDocumentReranker` are in `spring-ai-rag` (`rag.postretrieval.document`).
- `DecisionToolIndex`, `RegexToolIndex`, `LuceneToolIndex` and `VectorToolIndex` are in `spring-ai-tool-search-tool`;
  `spring.ai.chat.client.tool-search-advisor.tool-index-type` takes `regex`, `lucene`, `vector` or `decision`.
- Message parts are in `chat.messages.part`. `OllamaChatModel` builds `ReasoningPart`s and replays thinking, so the reasoning
  lesson can run on Ollama.
- Upgrade notes that matter for phase 2: `getToolCalls()` and `getMedia()` return unmodifiable lists; message `equals()` compares
  parts; Anthropic and Gemini thinking come back as parts of one generation; Anthropic drops temperature / top-p / top-k and sends
  `Authorization: Bearer`.

## Machine and models

Measured on 2026-11-19: 11.8 GB RAM, C: 47 GB free, D: 257 GB free, Ollama 0.40.16.

- `OLLAMA_MODELS` is set to `D:\ollama\models`. Still to set (owner, then restart Ollama):
  `setx OLLAMA_MAX_LOADED_MODELS 1` and `setx OLLAMA_KEEP_ALIVE 2m`.
- Pulled: `d1-omni:600m` (849 MB, capabilities decision and vision), `deepseek-r1:1.5b` (1.1 GB, tools and thinking),
  `llama3.2:3b`, `gemma3:1b`, `nomic-embed-text`, plus `d3:2b` and `laya`. Only `d1-omni:600m` is used now; `llama3.2:3b`
  stays until phase 2 has re-recorded Module 6.
- One Ollama model in memory at a time. Don't run a model while Docker and the Gradle daemon are busy.

### The Qwen server (owner's machine on the LAN)

Probed on 2026-11-19 over plain HTTP from this PC:

- A LiteLLM proxy in front of vLLM, OpenAI-compatible (`/v1/chat/completions`). Inference runs there, so this PC's RAM limit
  doesn't apply.
- The chat model is a 27B Qwen 3 reasoning model (NVFP4). Both chat aliases the proxy lists route to that same model; use either.
- Replies carry `reasoning_content` beside `content`. With a tool, it returns reasoning and a `findOrder` call
  (`finish_reason: tool_calls`) in 3–7 s.
- Replaying the assistant turn with its `reasoning_content`, then a tool result, is accepted, and the model answers from the result.
- `chat_template_kwargs: {"enable_thinking": false}` turns reasoning off. The owner's other Spring AI app found that `extra-body`
  values bind as strings, so `"false"` is truthy in the chat template; check that on 2.1 for a gotcha in 1.5.
- It also serves an 8B embedding model, a reranker, a 4B guard model, ASR and OCR models; this plan doesn't use them.

## Steps

### 1. Ground work

- [x] Fix the typography 0.5.4 fallout in `global.css`. Only the `not-prose` change mattered (code viewer and diagram margins);
      after the fix every lesson's layout matches `main` at 1280px and 390px in both themes.
- [x] Preview stack: a `PREVIEW_STACK` next to `STACK` in `src/data/versions.ts`, a preview flag per lesson in
      `src/data/curriculum.ts`, the "Preview" line in `LessonLayout`, the navigation mark, and preview pins in `buildGradle()` /
      `gradleDependencies()`. Update DESIGN.md for the mark.
- [x] Set up `lesson-src/preview-2.1/` on the Module 5/6 workflow (code, tests, templates, `assemble.py`, `findings.md`) with a
      2.1.0-RC2 / Boot 4.2.0-RC2 classpath.
- [x] Run the classes to confirm every fact under "Checked in the RC2 jars", and record the results in `findings.md`.

### 2. Lessons (each: code that compiles and passes its tests, recordings, sandbox, lesson)

- [x] 2.3 Decision Models and the Decision Model & Threshold Simulator (first: the other decision lessons build on it). Shipped in
      1.6; found on the way: the OpenAI starter's `OpenAiDecisionModel` clashes with Ollama's unless `spring.ai.model.decision` is set.
- [ ] 4.4 Decision Filter & Reranker.
- [ ] 5.4 Tool Search & DecisionToolIndex.
- [ ] 1.5 Message Parts & Reasoning.

### 3. Ship each lesson as it is finished

For every lesson in step 2, before it merges:

- [ ] A one-line pointer to it from the related existing lesson (Native JSON Schema, Modular RAG, Tool Calling or Multi-Provider
      Portability).
- [ ] CLAUDE.md (its verified facts, the preview workflow), README.md (curriculum table), the module summary in
      `src/data/curriculum.ts` if it changes. With the first lesson: PRODUCT.md (preview lessons are checked against RC2, not a
      release) and `VERSION` 1.6.
- [ ] Check its page at 320px and 390px; `npm run build` passes; merge into `main`, push, confirm the deploy.

### 4. At GA (phase 2)

- [ ] Move the preview pins to 2.1.0 and Boot 4.2.0 GA, re-run the preview tests and recordings, drop the preview marks.
- [ ] Move the existing lessons to 2.1: re-check what CLAUDE.md says to re-check on an upgrade and every fact in its "Content
      accuracy" section; update the provider notes in Module 1 (Anthropic sampling and header, `DeepSeekAssistantMessage`).
- [ ] Rewrite Module 3 Chat Memory for Session Memory, migrate the Module 5 and 6 support app (`MemoryAdvisor.CONVERSATION_ID`,
      tool calls kept, erasure and retention on the session tables), add the decision filter to the app, regenerate the Module 5
      and 6 lessons.
- [ ] Re-record `TraceLab` and `AttackLab` with the Qwen model instead of `llama3.2:3b`, and rewrite what Testing & Evals,
      Security & Data Protection and CLAUDE.md say about the recorded behaviour (for example which attacks `llama3.2:3b` fell for).
- [ ] `VERSION` 2.0, merge.

## What step 1 changed

- `d1-omni:600m` is deterministic and fast (about 0.5 s a call), but weak at 600M parameters: a blatant injection scores 0.54;
  the RAG filter dropped an injected passage only because its evidence score was low, and kept an off-topic one; the tool index
  found no tool for any request at the default applicability threshold of 0.5. The lessons show these recordings as they are
  and teach thresholds, checks and evaluation from them, rather than presenting the decision features as reliable out of the
  box.
- `OpenAiChatModel` on the Qwen server returns `ReasoningPart`s, replays them as `reasoning_content`, and streams them; lesson
  1.5 can be built on it as planned.

## Open questions

- **The same code on Ollama's `/v1`.** Ollama's OpenAI-compatible endpoint names the field `reasoning`; confirm that the lesson
  code a reader runs against Ollama gets `ReasoningPart`s too.
- **Token usage across the tool loop.** The 2.1 notes call summed usage a change; CLAUDE.md already records summed usage for
  2.0.2. Settle it when running the classes.

Sources: [Upgrade notes](https://docs.spring.io/spring-ai/reference/2.1/upgrade-notes.html),
[Decision Models](https://docs.spring.io/spring-ai/reference/2.1/api/decision.html),
[RAG](https://docs.spring.io/spring-ai/reference/2.1/api/retrieval-augmented-generation.html),
[Tool Search Tool](https://docs.spring.io/spring-ai/reference/2.1/api/tools/tool-search-tool.html),
[Chat Memory](https://docs.spring.io/spring-ai/reference/2.1/api/chat-memory.html),
[Ollama Chat](https://docs.spring.io/spring-ai/reference/2.1/api/chat/ollama-chat.html).
