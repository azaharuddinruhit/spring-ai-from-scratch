**Title:** Tool search fails the whole request when the model calls `toolSearchTool` with `maxResults` 0 (Lucene index)

**Versions:** Spring AI 2.1.0-RC2 on Spring Boot 4.2.0-RC2. The same code is still on `main`: `ToolSearchTool`,
`LuceneToolIndex.doSearch` and `ToolSearchToolCallingAdvisor.extractToolNameReferences`.

**What happens**

`maxResults` is a parameter the model fills in, so a model can send `0`. With `tool-index-type: lucene`:

1. `ToolSearchTool` passes the value through unchecked. The advisor's `max-results` applies only when the model sends none.
2. `LuceneToolIndex.doSearch` calls `searcher.search(query, 0)`, which throws
   `IllegalArgumentException: numHits must be > 0`.
3. The default `ToolExecutionExceptionProcessor` turns that into a tool result holding the message text.
4. On the next call, `ToolSearchToolCallingAdvisor.extractToolNameReferences` parses every `toolSearchTool` response as
   `List<String>`. The request fails with
   `IllegalStateException: Conversion from JSON to java.util.List<java.lang.String> failed`, caused by
   `StreamReadException: Unrecognized token 'numHits'`.

So one bad tool argument fails the user's request instead of returning no tools. We saw it with `llama3.2:3b` on Ollama, and
reproduced it with a scripted model. The regex, vector and decision indexes treat `null` or a value ≤ 0 as 10; only Lucene
throws. Negative values fail the same way.

**Reproduce:** `spring.ai.chat.client.tool-search-advisor.enabled=true`, `tool-index-type=lucene`, a `ChatClient` with a few
`@Tool`s, a session id in the advisor context, and a scripted `ChatModel`:

```java
@Override
public ChatResponse call(Prompt prompt) {
    calls++;
    AssistantMessage reply = switch (calls) {
        case 1 -> toolCall("toolSearchTool", "{\"query\":\"cancel order\",\"maxResults\":0}");
        case 2 -> toolCall("cancelOrder", "{\"orderId\":\"A-1077\"}");
        default -> AssistantMessage.builder().content("Cancelled.").build();
    };
    return new ChatResponse(List.of(new Generation(reply)));
}
```

`chatClient.prompt().user("Please cancel order A-1077.").advisors(a -> a.param(sessionKey, "s-1")).call().content()` then
throws the `IllegalStateException` above.

**Expected**

- `ToolSearchTool` (or each index) treats a `maxResults` of 0 or below like `null`, and caps it at the advisor's `max-results`
  when that is set. Right now `max-results` is only a fallback, so a model can always ask for 10.
- `extractToolNameReferences` skips a `toolSearchTool` response that isn't a JSON list (an error message), instead of failing
  the request.

**Workaround:** wrap the auto-configured `ToolIndex` in a delegate that clamps
`maxResults` to `1..max-results` before calling `search`.
