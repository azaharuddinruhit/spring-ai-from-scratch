package com.example.support.chat;

import java.util.List;

import org.springframework.ai.tool.toolsearch.ToolIndex;
import org.springframework.ai.tool.toolsearch.ToolReference;
import org.springframework.ai.tool.toolsearch.ToolSearchRequest;
import org.springframework.ai.tool.toolsearch.ToolSearchResponse;

/**
 * Keeps every search between one and {@code maxResults} tools. The model chooses how many tools a search returns, and the
 * advisor's max-results applies only when it doesn't: a model that asks for 10 gets 10, and one that asks for 0 fails the
 * request with the Lucene index (Spring AI 2.1.0-RC2).
 */
record BoundedToolIndex(ToolIndex delegate, int maxResults) implements ToolIndex {

    @Override
    public ToolSearchResponse search(ToolSearchRequest request) {
        Integer asked = request.maxResults();
        int limit = asked == null || asked < 1 ? maxResults : Math.min(asked, maxResults);
        return delegate.search(new ToolSearchRequest(request.sessionId(), request.query(), limit, request.categoryFilter()));
    }

    @Override
    public void indexTool(String sessionId, ToolReference toolReference) {
        delegate.indexTool(sessionId, toolReference);
    }

    @Override
    public void indexTools(String sessionId, List<ToolReference> toolReferences) {
        delegate.indexTools(sessionId, toolReferences);
    }

    @Override
    public void clearIndex(String sessionId) {
        delegate.clearIndex(sessionId);
    }
}
