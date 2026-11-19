# Backlog

Future tasks, not yet started. Each needs the owner's go-ahead before work begins.

## Smooth the learning curve (from the 2026-11-18 review of Modules 1–5)

Measured on the built site (section reading times, not counting sandbox time):

| Module | Reading time | Code lines | Difficulty |
| --- | --- | --- | --- |
| 1 Foundations | 49 min (4 lessons) | ~490 | Easy–moderate |
| 2 Structured outputs | 26 min (2) | ~240 | Moderate |
| 3 Advisors & memory | 55 min (3) | ~730 | First real step up |
| 4 RAG & ETL | 51 min (3) | ~640 | Moderate–hard, broad |
| 5 Tools, MCP & agents | 117 min (3) | ~2,060 | Hard: a sharp step up |

Module 5 lessons are 2–4 times longer than earlier ones (Agentic Workflows: 47 min, 932 code lines). Most of the difficulty is
outside Spring AI: OAuth2 client credentials, resource servers, `@PreAuthorize`, JSON-RPC, conditional updates and idempotency
keys, virtual threads.

Tasks, biggest gain first:

1. ~~**Split Agentic Workflows into two lessons.**~~ Done on 2026-11-19: Human in the Loop (`human-in-the-loop`, the refund,
   `RefundApprovalLab`) and Agentic Workflows (the ticket reply, `TicketWorkflowLab`).
2. **Collapse files that barely change:** small records, exceptions, and tests carried over from earlier modules go behind a
   "show full file" toggle in `CodeFile`, with the changed lines shown first. Follow DESIGN.md.
3. **Add a "You'll need" line to each Module 5 lesson** (for example "Spring Security basics, OAuth2 client credentials"), so
   learners see the step up before they hit it.
4. **Consider marking lessons foundational or advanced**, so learners know what they can skim on a first pass.
5. **Consider fewer gotchas per lesson on a first read** (now 6–8): keep the most important ones visible and fold the rest.

## Spring AI 2.1 (phase 1 shipped, phase 2 waits for the release)

Agreed on 2026-11-19; the plan and its checklist are in `UPGRADE-2.1.md`, the work is on the `spring-ai-2.1` branch. Phase 1
shipped four preview lessons on 2.1.0-RC2 / Boot 4.2.0-RC2 (message parts and reasoning, Decision Models, the decision filter
and reranker, `DecisionToolIndex`). Phase 2, at GA, moves the rest of the course and replaces `ChatMemory` (deprecated for
removal) with Session Memory.

- File the upstream report drafted in `lesson-src/preview-2.1/upstream/tool-search-maxresults.md` (a `maxResults` of 0 fails
  the request with the Lucene tool index; still on `main` on 2026-11-19). The owner files it from their GitHub account.

## Other open items

- Start the whole support app with a real model and PostgreSQL. So far each part has been checked on its own: the 63 tests, the MCP
  client–server run, and the repositories on PostgreSQL 17.
- Build the Gradle dependency blocks shown in Module 5 with Gradle. The artifacts resolved with Maven; `spring-boot-starter-jdbc`
  on the shipping server was not in that build.
- Optional, not planned: publish the finished support app as a runnable project.
