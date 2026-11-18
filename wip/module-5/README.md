# Module 5 work in progress

Module 5 (Tool Calling, MCP & Agents) is paused. Nothing here is published: the three lessons have no MDX yet, so
`src/data/curriculum.ts` lists them as coming soon.

## What exists

- `code/` — the lesson Java code, verified against Spring AI 2.0.2 (62 tests passed). Shared support-app code from Modules 3 and 4
  is included so it compiles. New in Module 5:
  - tool calling: `order/`, `tools/`, `chat/SupportChatService`, `chat/SupportChatConfig`
  - MCP: `mcp/`, `security/`, `com/example/shipping/` (the server), `ShippingMcpServerTest`
  - workflows: `refund/` (human confirmation), `ticket/` (planner, routing, parallel writers, evaluator-optimizer)
  - `*.yaml` — the YAML the lessons show; `probe-only.properties` — settings only the probe needs
- `findings.md` — every verified 2.0.2 fact, with the probe that showed it. Fold these into CLAUDE.md when the lessons ship.
- `probes/` — throwaway programs that produced the findings. `run5.sh` and `pom.xml` built them (they need a classpath file,
  `cp5.arg`, produced from the pom with `mvn dependency:build-classpath`).
- Sandboxes are already in `src/components/islands/`: `ToolLoopLab`, `McpLab`, `TicketWorkflowLab`, `RefundApprovalLab`.

## To finish

1. Write `tool-calling`, `model-context-protocol` and `agentic-workflows` MDX (template: `@@CODE file | regex@@` lines assembled by a
   script into `CodeFile` blocks; see the Module 4 lessons for structure). Use the four labs.
2. Mention in lesson 1: `on-limit-exceeded` defaults to `THROW`; the service must check finish reason `toolCallLimitExceeded`.
   Also `PaymentClient` has no implementation (the learner's payment provider) and `ToolSearchToolCallingAdvisor` was verified
   (see findings.md).
3. Add the verified facts to CLAUDE.md, update README and PRODUCT.md, build, screenshot, then bump `VERSION` to 1.4.
