package com.example.support.mcp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;

/**
 * ChatClient lists a provider's tools on every request, so an unreachable MCP server would fail every chat.
 * This answers without the MCP tools instead, and tries again on the next request.
 */
public class BestEffortToolCallbacks implements ToolCallbackProvider {

    private static final Logger log = LoggerFactory.getLogger(BestEffortToolCallbacks.class);

    private final ToolCallbackProvider delegate;

    public BestEffortToolCallbacks(ToolCallbackProvider delegate) {
        this.delegate = delegate;
    }

    @Override
    public ToolCallback[] getToolCallbacks() {
        try {
            return delegate.getToolCallbacks();
        }
        catch (RuntimeException unavailable) {
            log.warn("MCP tools unavailable, answering without them: {}", unavailable.toString());
            return new ToolCallback[0];
        }
    }
}
