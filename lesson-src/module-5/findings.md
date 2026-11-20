# Module 5 findings (verified by running 2.0.2 classes unless marked "source")

The probes ran in a scratch folder (`tool-probe/`), so paths below use that layout: `tool-probe/l5` is now `code/`, and the
probe sources are in `probes/`.

## Re-checked on 2.1.0 (2026-11-20, Boot 4.2.0, MCP SDK 2.2.0)

- MCP: `McpProbe`, `McpSecurityProbe`, `ResilienceProbe` and `StdioProbe` give the same results (`alt_1_` renaming, the whole tool
  context in `_meta`, "Access Denied", `McpHttpClientTransportAuthorizationException`, `ClosedChannelException` while the server is
  down, a quiet STDIO server works and a default one times out). The SSE conditions still match a missing `protocol`; a `String`
  prompt is still an ASSISTANT message; `ReadResourceRequest(String)`, `GetPromptRequest(String, Map)` and
  `httpRequestCustomizer` are still deprecated. Run `StdioProbe` from a folder whose `cp.arg` holds the probe classes: the child
  server reads it.
- Tool limits: still 40 per tool and 150 in total; `defaultToolCallbacks` is still deprecated.
- Session Memory replaces `ChatMemory` (`SessionAdvisors`, memory at `HIGHEST_PRECEDENCE + 210` so it stores the question and RAG
  sees the history; the tests fail at the default `+ 1000`). The JDBC session repository opens a connection at startup to pick its
  SQL dialect, and its schema initializer too; `spring.ai.session.repository.jdbc.initialize-schema=never` stops only the second.
- Human in the loop uses 2.1's tool call confirmation: `@Tool(requiresConfirmation = true)` makes the call return a paused reply
  (`ToolCallDecisions.isAwaitingDecision`); `ToolCallingManager.executeToolCalls(prompt, response, decisions)` runs or denies it and
  needs a decision for every call of the reply. The session stores the paused reply, so it is the last message until the customer
  decides or writes again. On a resumed request the last message is a tool result, so `PiiRedactionAdvisor` skips it
  (`augmentUserMessage` would append a user message after the tool results). A JSON `59.90` reaches the tool as `BigDecimal` `59.9`: compare with
  `compareTo`.
- VERIFIED (probes/ConfirmationProbe.java): `executeToolCalls` with a decision missing throws `IllegalArgumentException: Every tool
  call of the reply needs a decision; missing: [...]`; an allowed call whose tool isn't in the prompt throws "The prompt does not
  carry the tool ..."; denied calls need no tools and answer with the deny message, or "The user did not allow this tool call.";
  without decisions a confirmation tool throws `ToolCallConfirmationRequiredException`. A new user message after a pause makes the
  session store a TOOL result "No result was recorded for this tool call." before the message. `stream()` pauses too (one chunk,
  awaiting). A model whose options aren't `ToolCallingChatOptions` never pauses: the loop doesn't run.
- VERIFIED (same probe): with memory at `+ 210` a plain tool loop stores only USER and the final ASSISTANT; the tool rounds run
  after memory and aren't kept. A confirmation's paused call and its tool result are kept, because they leave or enter the chain.
- Module 3 facts (probes/ChainFactsProbe.java, probes/EqualOrderProbe.java run on 2.1.0 and 2.0.2 jars): default orders
  unchanged (logger, SafeGuard, RAG 0; ToolCallingAdvisor + 300); `SessionAdvisors` builds `SessionTurnAdvisor` (+ 200) and
  `SessionMemoryAdvisor` (+ 1000); default-order memory stores every tool round (USER, ASSISTANT call, TOOL, ASSISTANT); a missing
  session id throws `IllegalStateException: No session ID found in advisor context. ...`; `stream()` skips a `CallAdvisor`-only
  advisor. SafeGuard after memory blocks on stored history, and in 2.1 its refusal has finish reason `guardrailRefusal` (memory
  stores the refusal). EQUAL ORDERS, both versions: reverse registration order (defaults and per-request advisors alike, the
  request's last first), EXCEPT advisors ordered after `ToolCallingAdvisor` when the model's options are
  `ToolCallingChatOptions` (every real provider): those run in registration order. A lambda `ChatModel` has no tool loop, so it
  shows only the reverse rule. The course said "reverse" without the exception until 2026-11-20.

## MCP (probes: tool-probe/p/mcpprobe/McpProbe.java, McpSecurityProbe.java, StdioProbe.java)
- WebMVC server without `spring.ai.mcp.server.protocol` starts the SSE transport (EnabledSseServerCondition matchIfMissing=true,
  Streamable matchIfMissing=false), although McpServerProperties declares STREAMABLE. A streamable-http client then fails startup with
  `McpTransportException: Server Not Found. Status code:404 ... "path":"/mcp"`. Fix: `spring.ai.mcp.server.protocol: STREAMABLE`.
- Two connections exposing the same tools: first set keeps names (`cancel-order` -> `cancel_order`, `orderStatus`), second set gets
  `alt_1_cancel_order`, `alt_2_orderStatus` with a WARN from DefaultMcpToolNamePrefixGenerator.
- ToolContext {customerId, tenantApiKey} arrived at the server as `McpMeta` = {customerId=cust-42, tenantApiKey=sk-tenant-secret}.
- McpSyncHttpClientRequestCustomizer bean header reached both connections (all requests: POST/GET /mcp).
- Tool result to the model: `[{"text":"Order 1042 has shipped"}]` (JSON of content list).
- Server tool throwing IllegalArgumentException("Order 0 cannot be cancelled") -> client ToolExecutionException
  "Error calling tool: [TextContent[annotations=null, text=Order 0 cannot be cancelled ...]]" (message reaches client; ERROR log).
- @McpTool annotation hints default: readOnlyHint=false, destructiveHint=true, idempotentHint=false, openWorldHint=true; title = name.
- Server info: name from spring.ai.mcp.server.name, version 1.0.0; capabilities tools/resources/prompts listChanged=true, completions, logging.
- @McpResource policy://refunds listed and readable (mimeType text/plain); @McpPrompt with @McpArg required=true listed.
- Security: Spring Security resource server with JWT, `/mcp` requires SCOPE_mcp.tools.
  - No token: client app FAILS TO START (McpHttpClientTransportAuthorizationException: Authorization error when sending message).
  - SecurityContext is available inside the sync @McpTool method (http-nio thread), auth=agent-7.
  - @PreAuthorize("hasAuthority('SCOPE_orders.write')") on @McpTool + @EnableMethodSecurity: without scope -> tool error "Access Denied";
    with scope -> runs.
- STDIO: client starts `java ... Server` with `spring.ai.mcp.client.stdio.connections.orders.command/args[i]`; server needs
  `spring.ai.mcp.server.stdio=true`, `spring.main.web-application-type=none`, and `spring.main.banner-mode=off` +
  `logging.pattern.console=` . With those: tools listed after ~6.7 s, call works. Without them: client logs
  "Error processing inbound message for line:" and startup fails with TimeoutException after request-timeout.

## Human in the loop (source)
- `AdvisorParams.toolCallingAdvisorAutoRegister(false)` (key spring.ai.chat.client.tool.calling.advisor.auto-register) stops
  ChatClient adding ToolCallingAdvisor; then the ChatResponse carries tool calls and you run
  `ToolCallingManager.executeToolCalls(prompt, response)` yourself (returns ToolExecutionResult conversationHistory/returnDirect).
- ChatClientAutoConfiguration line ~126 calls defaultAdvisors(toolCallingAdvisorAutoRegister(false)) under some condition: check.
- `ToolCallAdvisor` deprecated (2.0.0, forRemoval) in favour of ToolCallingAdvisor.
- VERIFIED (p/HitlProbe.java): ToolCallingAdvisor.builder().toolExecutionEligibilityChecker(r -> ...) returning false for `refund`
  returns the ChatResponse with the tool calls to the caller (text '', finishReason null), the tool doesn't run, model called once,
  BUT MessageChatMemoryAdvisor saves the ASSISTANT tool-call message with no tool response (dangling tool call in memory).
  Approving: DefaultToolCallingManager.executeToolCalls(lastPrompt, response) runs it and returns history USER, ASSISTANT calls, TOOL.
- `spring.ai.chat.client.tool-calling.enabled=false` (ChatClientBuilderProperties.ToolCalling) adds toolCallingAdvisorAutoRegister(false)
  to the auto-configured builder; also `spring.ai.chat.client.tool-calling.advisor-order`. With auto-register off: tool calls come back,
  tools not run.
- Lesson design: approval via a pending-action tool (returnDirect) + approval endpoint, not via the checker (dangling memory).

## MCP resilience (p/mcpprobe/ResilienceProbe.java, VERIFIED)
- initialized=true (default) + server down/404/401 -> client app fails to start.
- `spring.ai.mcp.client.initialized=false`: app starts with server down; SyncMcpToolCallbackProvider.getToolCallbacks() throws
  (root ClosedChannelException) and ChatClient resolves providers on EVERY request (DefaultChatClientUtils, when options are
  ToolCallingChatOptions) -> every chat request fails while the server is down, even ones that wouldn't use the tool.
- Server comes up later: client initialises lazily, tools listed, calls work. Tool list cached (invalidateCache on McpToolsChangedEvent).
- Server goes down after caching: chat works; the tool call result the model sees is "java.net.ConnectException".
- `defaultToolCallbacks(...)`/`toolCallbacks(...)` deprecated forRemoval in 2.0.0: use `defaultTools(Object...)` / `tools(...)`, which
  accept @Tool objects, ToolCallback, ToolCallbackProvider (and arrays/lists).
- Auto-config: McpToolNamePrefixGenerator bean DefaultMcpToolNamePrefixGenerator (dedups alt_N_); McpToolFilter bean (BiPredicate
  <McpConnectionInfo, McpSchema.Tool>); ToolContextToMcpMetaConverter bean (default copies all, `noOp()`); per-connection transport:
  `McpClientCustomizer<HttpClientStreamableHttpTransport.Builder>` bean `customize(String name, builder)` runs after the global
  request customizers are set. Default ToolExecutionExceptionProcessor rethrows Spring Security ClientAuthorizationException.
- MCP tools are NOT added to ChatClient automatically: pass the SyncMcpToolCallbackProvider to defaultTools.

## l5 app (tool-probe/l5, run with tool-probe/run5.sh; probe-only settings in tool-probe/config/application.properties)
- YAML map keys keep case: max-calls-per-tool: findOrder: 3 binds as findOrder (brackets not needed).
- Adding spring-boot-starter-oauth2-client brings Spring Security: existing @WebMvcTest tests got 401/403 until the app had a
  SecurityFilterChain (resource server JWT, csrf off, stateless) and tests used @Import(SecurityConfig.class) + .with(jwt()).
- E2E (p5/.../McpE2eProbe.java, fake auth server + shipping server + support client config): one client_credentials token request
  (basic auth, scope mcp+shipments.read) reused for both calls; only track_shipment listed (McpToolFilter); tools/call `_meta: {}`
  with noOp converter; clientInfo {"name":"spring-ai-mcp-client-shipping","title":"shipping"}; protocolVersion 2025-11-25;
  record result -> [{"text":"{\"trackingNumber\":...}"}]. Token endpoint down at startup -> ClientAuthorizationException fails startup.
  AuthorizedClientServiceOAuth2AuthorizedClientManager defaults to client_credentials. Boot 4.1 does not define a manager bean.
- Server test (ShipmentToolsMcpTest): no scope -> isError with "Access Denied"; bad token -> client initialize fails with
  "Authorization error when sending message". `httpRequestCustomizer` deprecated: use addHttpRequestCustomizer.

## Later findings
- VERIFIED: @McpPrompt returning String or List<String> -> PromptMessage role ASSISTANT (AbstractMcpPromptMethodCallback
  .convertToGetPromptResult). Return PromptMessage.builder(Role.USER, TextContent.builder(text).build()).build() for instructions.
  ReadResourceRequest(String)/GetPromptRequest(String,Map) constructors deprecated: use .builder(...).
- L2 shipping server now also has ShippingGuides (@McpResource shipping://policies/delivery text/markdown, @McpPrompt explain-delay).
- L3 TicketReplyService reworked: planner (orchestrator) -> Plan(issues<=MAX_ISSUES 4) -> department writers in parallel on virtual
  threads (routing + workers) -> editor merges (if >1) -> reviewer/editor loop MAX_ROUNDS 3. 62 tests pass.
- VERIFIED (p/tsprobe/ToolSearchProbe.java): ToolSearchToolCallingAdvisor (spring-ai-tool-search-advisor; Boot: starter
  spring-ai-starter-tool-search-advisor + spring.ai.chat.client.tool-search-advisor.enabled=true, tool-index-type regex default |
  lucene | vector, max-results, replaces the ToolCallingAdvisor.Builder bean). Tools sent per model call:
  [toolSearchTool] -> model searches "order" -> responseData ["findOrder"] -> [findOrder, toolSearchTool]. System message gets a
  suffix explaining toolSearchTool. No CONVERSATION_ID -> IllegalArgumentException "context must contain a non-null value for
  'chat_memory_conversation_id'". Index is per session (conversation id), LRU 1000 sessions.
- Limits (source): defaults max-calls-per-tool-default 40 (DefaultToolCallingManager.DEFAULT_MAX_CALLS_PER_TOOL), max-total-tool-calls
  150, on-limit-exceeded THROW | RETURN_ERROR_RESPONSE (default THROW). THROW: ToolCallingAdvisor catches ToolCallLimitExceededException
  and returns ONE Generation, finish reason "toolCallLimitExceeded", text = breach message "Tool call limit (3) exceeded for tool
  'findOrder'. No further calls to this tool are allowed in this turn." (total: "Total tool call limit (12) exceeded for this turn.
  No further tool calls are allowed."). RETURN_ERROR_RESPONSE: model gets that text as the tool response and continues.
  -1 disables a limit; excluded-tools list. throw-exception-on-error default false.
- Added refund/RefundConfig (Clock bean): RefundService needs a Clock. PaymentClient has no implementation (learner's provider).
- VERIFIED on PostgreSQL 17 (probes/RepoProbe.java): OrderRepository and RefundRepository work; the driver cannot bind an enum or
  an Instant (`Can't infer the SQL type`), so `paramSource(refund)` failed; RefundRepository binds `.name()` and `OffsetDateTime`.
  `UPDATE ... WHERE status = 'PENDING'` returns 1 then 0 for a second confirmation.
- Session claims (probes/SessionClaimsProbe.java, 2.1.0): with memory at `+ 210` the model gets SYSTEM, the stored history,
  then the new USER message; the system message is not stored. EXPIRY IS ONLY A DATE: `findById` returns an expired session
  (in memory, and the JDBC `SELECT ... WHERE s.id = ?` has no expiry condition), the advisors' `findOrCreate` keeps using it,
  and only `deleteExpiredSessions(before)` removes it (with its events). The memory advisor's default event filter is
  `EventFilter.all()`. JDBC `initialize-schema` defaults to `embedded` (Boot's `DatabaseInitializationProperties`). Module 3's
  lesson code (all three lessons, 14 tests) compiles and passes on 2.1.0 (run without Spring Security on the classpath).
- RAG before memory (probes/RagBeforeMemoryProbe.java, run with the Module 4 lesson classes on 2.1.0): with RAG at `+ 100` session
  memory stores the augmented prompt, 422 characters for a 33-character question; at `+ 225` it stores the 33. The Module 4
  lesson code compiles and passes on 2.1.0 (22 + 18 tests); the ETL lesson uses `KnowledgeFilters` before the next lesson shows it.
- Module 4 on 2.1.0 (bytecode and source diffs against 2.0.2): `spring-ai-rag` unchanged except the new Decision* classes;
  `TokenTextSplitter` rewritten for `withChunkOverlap` (default 0) but SplitCompare gave identical chunks (11,347 over 124 texts, five
  configs); `ExtractedTextFormatter` regexes replaced by a loop, identical output on 12,000 texts; the filter parser adds
  `MAX_EXPRESSION_DEPTH = 100` (AND/OR count as levels), lexer, builder and `PgVectorFilterExpressionConverter` unchanged;
  `PgVectorStore` gains configurable column names and calls `embeddingModel.dimensions()` only when it creates the table
  (otherwise reads the column size), plus dimension checks on the new upsert and query-embedding search paths only;
  the PDF layout stripper adds a 30,000-lines-per-page guard. The BOM still has 21 vector store starters and the same four readers.
