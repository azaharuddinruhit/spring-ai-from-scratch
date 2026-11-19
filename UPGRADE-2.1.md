# Upgrade to Spring AI 2.1

The plan for moving the whole course from Spring AI 2.0.2 to 2.1, agreed with the owner on 2026-11-19. Work happens on the
`spring-ai-2.1` branch. Tick items off here as they are done.

## Decisions

- **The whole course moves to 2.1.** There is no separate "What's new" module: each 2.1 feature goes into the module where a
  learner would look for it.
- **Ship at GA.** 2.1 is at 2.1.0-RC2 and its docs still call 2.0.2 the stable release. The site says every lesson was checked
  against the released classes, so `main` keeps 2.0.2 until 2.1.0 GA is out. Then the pin moves from RC2 to GA, the tests run
  again, and the branch merges. (2.0 went from RC2 to GA in three days.)
- **Memory: Session Memory only.** `ChatMemory`, `MessageChatMemoryAdvisor`, `MessageWindowChatMemory` and the chat memory
  repositories are deprecated for removal in 3.0. Lessons teach `SessionAdvisors` and cover the old API in one
  `Gotcha kind="migration"`.
- **Ollama models only.** No cloud keys. Every recording (decisions, reasoning, traces, attacks) comes from local Ollama.
- **Small models only.** The machine has 11.8 GB of RAM and 11 GB free on C:, so 7B+ thinking models (`qwen3:8b`,
  `deepseek-r1:7b`) are out. See "Machine limits" below for the models and settings.
- **Sandboxes show recorded runs only.** The decision simulator offers preset messages with recorded `d1-omni:600m`
  probabilities. The sliders re-route those real numbers; there is no free-text input with made-up scores.
- **Version:** `VERSION` goes to the next major (2.0) when the branch merges, because the whole course moves to a new stack.

## Where the new content goes

| 2.1 feature | Where |
| --- | --- |
| Message parts, `getReasoning()`, reasoning across turns | New lesson in Module 1, after Multi-Provider Portability |
| `DecisionModel`, `YesNoQuestion` / `ChoiceQuestion` / `ScoreQuestion` | New lesson 2.3 in Structured Outputs, with the Decision Model & Threshold Simulator |
| `DecisionDocumentFilter`, `DecisionDocumentReranker` | Module 4, probably a new lesson 4.4 (Modular RAG is already long). The filter becomes the support app's injection screen |
| `DecisionToolIndex` | Module 5 Tool Calling: the tool-search section grows into a comparison of the regex, Lucene, vector and decision indexes |
| Session Memory | Module 3 Chat Memory rewritten; the Module 5 and 6 support app migrated |

Each new lesson keeps the five-section layout and gets a sandbox.

## Machine limits

Measured on 2026-11-19: 11.8 GB RAM, C: 11 GB free, D: 187 GB free.

- **Disk.** Ollama keeps models in `%USERPROFILE%\.ollama\models` on C: unless `OLLAMA_MODELS` is set, so they move to D:.
  `tinyllama` is the only model there now; pull it again later or drop it. The RC2 jars go to the Maven/Gradle caches on C:
  (a few hundred MB). If C: runs low, move `GRADLE_USER_HOME` and the Maven local repository to D: as well.
- **RAM.** One model in memory at a time, unloaded after two idle minutes. Don't run a model while Docker (PostgreSQL 17 for the
  Module 4 and 6 checks) and the Gradle daemon are busy; stop Docker between those checks.

The owner runs these once (they change the user environment), then quits and restarts Ollama:

```
setx OLLAMA_MODELS D:\ollama\models
setx OLLAMA_MAX_LOADED_MODELS 1
setx OLLAMA_KEEP_ALIVE 2m
```

### Models

The smallest model that does each job. Pull them one at a time, when a step needs them, and `ollama rm` what a finished step no
longer needs. Each still needs a first run in step 1 to confirm it works.

| Model | Download | For | Instead of |
| --- | --- | --- | --- |
| `d1-omni:600m` | small (600M parameters) | Decision Models, filter, reranker, `DecisionToolIndex` | (the 2.1 default) |
| `qwen3:0.6b` | about 0.5 GB | Reasoning: message parts and `getReasoning()` | `qwen3:8b` |
| `qwen3:1.7b` | about 1.4 GB | Reasoning, if 0.6b's thinking is too thin to teach from | `qwen3:8b` |
| `deepseek-r1:1.5b` | about 1.1 GB | Second reasoning model, only if a lesson compares two | `deepseek-r1:7b` |
| `llama3.2:3b` | about 2 GB | Re-recording the Module 6 traces and attacks, where the 2.1 output changes | (unchanged) |

Sizes are approximate; `ollama pull` shows the exact size.

**Honesty about small models.** Recorded reasoning from a 0.6B–1.7B model is short and sometimes wrong. The lesson is about the
structure (which parts come back, in which order, what is replayed), so that is fine, but the lesson names the model behind each
recording and doesn't present its reasoning as good reasoning. The same goes for decision probabilities: they are what
`d1-omni:600m` returned, and the lesson says another model may give different numbers.

## Steps

### 1. Find out what breaks

- [ ] Owner: run the three `setx` commands under "Machine limits" and restart Ollama.
- [ ] Pull `d1-omni:600m` and `qwen3:0.6b`. Pull `llama3.2:3b` only when Module 6 needs re-recording.
- [ ] Build a 2.1.0-RC2 classpath for `lesson-src` and check that RC2 runs on Boot 4.1.2 (or find the Boot version it needs).
- [ ] Compile the Module 5 and 6 code and run the tests. Record every compile error and deprecation warning.
- [ ] Re-check what CLAUDE.md says to re-check on an upgrade: `src/lib/token-text-splitter.ts`, `src/lib/vector-filter.ts`,
      `RecordSchemaLab` against `BeanOutputConverter.getJsonSchema()`, and the advisor orders in `AdvisorChainLab`, `GuardrailLab`
      and `ChatMemoryLab`.
- [ ] Re-check every fact in the "Content accuracy" section of CLAUDE.md against RC2.
- [ ] Write the results in `lesson-src/upgrade-2.1/findings.md`.

### 2. Migrate Modules 1–6, in order

- [ ] Module 1: provider notes (Anthropic: no temperature / top-p / top-k, `Authorization: Bearer`; `DeepSeekAssistantMessage`
      deprecated; `deepseek-reasoner` in `src/data/snippets.ts`).
- [ ] Module 2: re-run the structured-output checks.
- [ ] Module 3: rewrite Chat Memory for Session Memory (`spring-ai-session-advisor`, `spring-ai-starter-model-session-jdbc`,
      `EventFilter.lastN`, compaction, `MemoryAdvisor.CONVERSATION_ID` or `SessionAdvisors.session(id)`). Update `ChatMemoryLab`,
      `AdvisorChainLab` and `HeroTrace`.
- [ ] Module 4: re-run the ETL, vector store and RAG checks on PostgreSQL 17.
- [ ] Module 5: migrate the support app (`ChatMemoryConfig`, `SupportChatConfig`, `SupportChatService`, tests) and regenerate the
      lessons from the templates.
- [ ] Module 6: Session Memory keeps tool calls, so the `JdbcChatMemoryRepository` gotcha becomes a migration note; rework erasure
      and retention for the session tables; re-record `TraceLab` and `AttackLab` where the output changed (for example, token
      usage is now summed across the tool loop).

### 3. Write the new content

- [ ] Module 1: Message Parts & Reasoning, with a sandbox showing the parts of a recorded message.
- [ ] Module 2: Decision Models, with the Decision Model & Threshold Simulator.
- [ ] Module 4: decision filter and reranker, with a sandbox for the filter policy.
- [ ] Module 5: `DecisionToolIndex` and the tool-index comparison.

### 4. Update the rest

- [ ] `src/data/versions.ts`, the "Content accuracy" section and module notes in CLAUDE.md, `PRODUCT.md`, `README.md`, the
      Module summaries in `src/data/curriculum.ts`.
- [ ] Check new pages at 320px and 390px. `npm run build` passes.

### 5. Ship

- [ ] When 2.1.0 GA is out: move the pin from RC2 to GA, run the tests and probes again, raise `VERSION` to 2.0, merge.

## Open questions to settle in step 1

- **Ollama and reasoning parts.** The upgrade notes list the models that build message parts in RC2: OpenAI, Anthropic, Google
  GenAI, DeepSeek, Bedrock and Mistral. Ollama is not on the list, and the Ollama page still shows thinking in the `thinking`
  metadata key. If that holds, the lesson teaches `getReasoning()` and states that Ollama keeps thinking in metadata (or uses
  Ollama's OpenAI-compatible endpoint through `OpenAiChatModel`, if that yields `ReasoningPart`s; to be tested). Test both
  with `qwen3:0.6b`.
- **Small thinking models with tools.** The lesson shows reasoning interleaved with tool calls. Check whether `qwen3:0.6b` or
  `qwen3:1.7b` calls tools reliably (in Module 6, `qwen2.5:1.5b` never did). If neither does, the interleaving is shown with
  one recorded run that worked, and the lesson says how often it worked.
- **The decision model selector property.** The docs show `spring.ai.openai.decision` and `spring.ai.ollama.decision` prefixes.
  Whether a `spring.ai.model.decision` selector exists has to come from the auto-configuration jar.
- **Token usage summed across the tool loop.** The upgrade notes list it as a 2.1 change; CLAUDE.md already records summed usage
  for 2.0.2. Check which is right.

## Verified so far (2.1 reference docs, 2026-11-19)

- `DecisionModel.call(DecisionPrompt)`; questions `YesNoQuestion`, `ChoiceQuestion`, `ScoreQuestion`; answers `YesNoAnswer.isYes(threshold)`,
  `ChoiceAnswer.getRankedOptions()`, `ScoreAnswer.getNearestLevel()`; `isRefused(name)` for refusals. Implementations
  `OpenAiDecisionModel`, `OllamaDecisionModel` (default `d1-omni:600m`), `SystemOneDecisionModel`. Observed as
  `gen_ai.client.operation` with the `decision` operation name.
- `DecisionDocumentFilter`: four questions (injection, contradicts premise, relevant, answer evidence), default policy
  0.70 / 0.70 / 0.45 / 0.55, fails open by default with one warning per run, `failClosed(true)`, conflicting passages kept with
  `decision.classification`. `DecisionDocumentReranker`: `topK`, `minimumScore` 0, timeout 60 s, `concurrency(4)`, unscored
  documents kept after the scored ones. Both take `virtualThreads(boolean)` (default false); a custom `executor` drops the
  concurrency limit. Filter first, then rerank.
- `DecisionToolIndex`: one call asks which tool fits and whether any fits; `applicabilityThreshold` 0.5, `minimumRelevance` 0;
  sends every tool on every search; `spring.ai.chat.client.tool-search-advisor.tool-index-type=decision`.
- Message parts: `TextPart`, `ReasoningPart`, `ToolCallPart`, `ToolResultPart`, `MediaPart`, `UnknownPart`; `getParts()`;
  `getText()`, `getToolCalls()` and `getReasoning()` are views over the parts.
- Session Memory: `SessionAdvisors.builder(sessionService)`, `spring-ai-starter-model-session-jdbc`, keeps tool calls; does not
  read the old `SPRING_AI_CHAT_MEMORY` table.

These come from the docs, not from running the classes yet. Step 1 confirms them.

Sources: [Decision Models](https://docs.spring.io/spring-ai/reference/2.1/api/decision.html),
[RAG](https://docs.spring.io/spring-ai/reference/2.1/api/retrieval-augmented-generation.html),
[Tool Search Tool](https://docs.spring.io/spring-ai/reference/2.1/api/tools/tool-search-tool.html),
[Upgrade notes](https://docs.spring.io/spring-ai/reference/2.1/upgrade-notes.html),
[Chat Memory](https://docs.spring.io/spring-ai/reference/2.1/api/chat-memory.html),
[Ollama Chat](https://docs.spring.io/spring-ai/reference/2.1/api/chat/ollama-chat.html).
