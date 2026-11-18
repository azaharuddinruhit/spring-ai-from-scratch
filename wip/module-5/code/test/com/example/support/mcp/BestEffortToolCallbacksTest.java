package com.example.support.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;

class BestEffortToolCallbacksTest {

    private final ToolCallbackProvider mcpTools = mock(ToolCallbackProvider.class);
    private final BestEffortToolCallbacks tools = new BestEffortToolCallbacks(mcpTools);

    @Test
    void offersTheServersTools() {
        ToolCallback trackShipment = mock(ToolCallback.class);
        given(mcpTools.getToolCallbacks()).willReturn(new ToolCallback[] {trackShipment});

        assertThat(tools.getToolCallbacks()).containsExactly(trackShipment);
    }

    @Test
    void answersWithoutTheToolsWhileAServerIsDown() {
        given(mcpTools.getToolCallbacks()).willThrow(new IllegalStateException("Connection refused"));

        assertThat(tools.getToolCallbacks()).isEmpty();
    }
}
