# Module 5 findings (verified by running 2.0.2 classes unless marked "source")

The probes ran in a scratch folder (`tool-probe/`), so paths below use that layout: `tool-probe/l5` is now `code/`, and the
probe sources are in `probes/`.

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
