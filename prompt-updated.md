> The original request for the Spring AI 2.1 work. `UPGRADE-2.1.md` is the agreed plan and overrides this file where they
> differ (preview lessons now, no free-text input in the simulator, Session Memory later).

You are a Principal Java & Spring Architect, AI Systems Educator, and Expert Code Auditor.

I have already built the core "Spring AI from Scratch" learning platform using Java 25, Gradle 9, Spring Boot 4, and Spring AI 2.x. Now, I want you to perform a **comprehensive gap analysis and audit** of my existing codebase to integrate the latest **Spring AI 2.1.0-RC2** features, focusing heavily on **Decision Models**, **Message Parts & Reasoning**, and advanced RAG/Tool enhancements.

### Phase 0: Workspace Audit & Gap Discovery (DO NOT WRITE CODE YET)
Before modifying files, scan my workspace directory and compare my current curriculum modules against the new Spring AI 2.1 specifications. Output a **Gap Analysis Report** answering:
1. **Existing Structure Check:** Which modules, lessons, and visualizer components currently exist?
2. **Missing Feature Audit:** Are `DecisionModel` APIs (`YesNoQuestion`, `ChoiceQuestion`, `ScoreQuestion`), decision-backed RAG post-processors (`DecisionDocumentReranker`, `DecisionDocumentFilter`), `DecisionToolIndex`, and Message Parts (`getReasoning()`) covered anywhere in the current content?
3. **Proposed Injection Plan:** Which specific modules or new sub-lessons should be added or updated to bridge these gaps?

---

### Master Upgrade Blueprint (Execute AFTER Your Gap Report)

Once we review the audit, implement the following updates across the codebase:

#### 1. Add Module / Sub-Lesson: Spring AI 2.1 Decision Models (`DecisionModel`)
- **Concept & Architecture:** Explain why classification and routing should not rely on unconstrained chat completions. Detail the `DecisionModel` abstraction, auto-configuration (`spring.ai.model.decision=openai` or `ollama` with `d1-omni:600m`), and provider implementations (OpenAI Decisions API, Ollama, System One).
- **Question Types:** Break down `YesNoQuestion` (probability of yes), `ChoiceQuestion` (selected option probabilities), and `ScoreQuestion` (ordered scales like unhappy/neutral/happy).
- **Mermaid Diagram:** Render a sequence flow contrasting naive chat prompt parsing vs. typed `DecisionModel` execution and threshold routing.
- **Java 25 & Gradle 9 Code Snippets:** Complete examples showing how to inject `DecisionModel` into service classes, handle typed response objects, and configure properties in `application.yml`.

#### 2. Update Module 4 (RAG): Decision-Based Post-Processors
- Integrate **`DecisionDocumentReranker`** (asking a decision model whether each retrieved chunk answers the query) and **`DecisionDocumentFilter`** (screening chunks for prompt injection, contradictions, and relevance before prompt assembly). Explain parallel execution on Java 25 virtual threads and fail-open/fail-closed behaviors.

#### 3. Update Module 5 (Tools & Agents): `DecisionToolIndex`
- Add coverage for **`DecisionToolIndex`** as a core tool-selection strategy alongside regex, Lucene, and vector indexes. Explain how it queries a decision model to find the best tool and check applicability simultaneously.

#### 4. Add Sub-Lesson: Message Parts & Reasoning Blocks (Spring AI 2.1)
- Explain how current reasoning models (like Claude thinking blocks or Gemini thought signatures) interleave reasoning with tool calls and text. Cover how Spring AI 2.1 exposes these via `getReasoning()` and structured message parts across chat history turns.

#### 5. Interactive Visualizer Component: "Decision Model & Threshold Simulator"
- Build a new interactive frontend widget where users can type an input message or query, choose a decision type (Yes/No, Choice, Score), adjust probability thresholds, and visualize how a decision model classifies input and routes data before hitting the main chat or RAG pipeline.

---

**Acknowledge this prompt, scan my repository files, and present the Gap Analysis Report first.**