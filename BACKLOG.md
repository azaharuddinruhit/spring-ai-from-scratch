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
2. ~~**Collapse files that barely change.**~~ Done on 2026-11-21, site-wide (the owner's choice): a long file opens folded to its
   key lines with gap rows and a "Show full file" button (`src/lib/code-fold.mjs`). Module 5 reading time fell from 26-50 to
   11-23 minutes a lesson.
3. ~~**Add a "You'll need" line to each Module 5 lesson**~~ Done on 2026-11-20 (Tool Search already had one).
4. ~~**Mark lessons foundational or advanced.**~~ Done on 2026-11-21: seven lessons carry `deepDive` (Message Parts, Decision
   Models, Decision Filter, MCP, Human in the Loop, Agentic Workflows, Tool Search), tagged in the navigation.
5. ~~**Fewer gotchas per lesson on a first read.**~~ Done on 2026-11-21: three visible per lesson, the rest in `MoreGotchas`.
   Reading time with items 2 and 5: 8-21 minutes a lesson (was 11-50).

## Spring AI 2.1 (done)

The course runs on Spring AI 2.1.0 / Boot 4.2.0 since site version 2.0; `UPGRADE-2.1.md` holds the plan and what each phase
found. Module 3 teaches Session Memory instead of `ChatMemory` (deprecated for removal).

- File the upstream report drafted in `lesson-src/preview-2.1/upstream/tool-search-maxresults.md` (a `maxResults` of 0 fails
  the request with the Lucene tool index; still on `main` on 2026-11-19). The owner files it from their GitHub account.

## Other open items

- Start the whole support app with a real model and PostgreSQL. So far each part has been checked on its own: the 63 tests, the MCP
  client–server run, and the repositories on PostgreSQL 17.
- Build the Gradle dependency blocks shown in Module 5 with Gradle. The artifacts resolved with Maven; `spring-boot-starter-jdbc`
  on the shipping server was not in that build.
- Optional, not planned: publish the finished support app as a runnable project.
