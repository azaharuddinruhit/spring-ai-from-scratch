package com.example.support.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.execution.ToolExecutionException;
import org.springframework.ai.tool.execution.ToolExecutionExceptionProcessor;
import org.springframework.security.oauth2.client.ClientAuthorizationException;
import org.springframework.stereotype.Component;

/** Decides what the model reads when a tool fails. Only refusals pass through; everything else is logged and replaced. */
@Component
class ModelSafeToolErrors implements ToolExecutionExceptionProcessor {

    private static final Logger log = LoggerFactory.getLogger(ModelSafeToolErrors.class);

    @Override
    public String process(ToolExecutionException exception) {
        String tool = exception.getToolDefinition().name();
        return switch (exception.getCause()) {
            case ToolRefusalException refusal -> refusal.getMessage();
            // Spring AI's default processor rethrows these too: a failed token request is not the model's problem.
            case ClientAuthorizationException authorization -> throw authorization;
            case RuntimeException failure -> {
                log.error("Tool {} failed", tool, failure);
                yield "The " + tool + " tool is unavailable right now. Say so and do not guess the answer.";
            }
            default -> throw exception;
        };
    }
}
