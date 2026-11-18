package com.example.support.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.execution.ToolExecutionException;
import org.springframework.dao.DataAccessResourceFailureException;

class ModelSafeToolErrorsTest {

    private static final ToolDefinition FIND_ORDER =
            ToolDefinition.builder().name("findOrder").description("Find an order").inputSchema("{}").build();

    private final ModelSafeToolErrors errors = new ModelSafeToolErrors();

    @Test
    void passesARefusalToTheModel() {
        var exception = new ToolExecutionException(FIND_ORDER, new ToolRefusalException("This customer has no order 2001."));

        assertThat(errors.process(exception)).isEqualTo("This customer has no order 2001.");
    }

    @Test
    void hidesInfrastructureDetails() {
        var exception = new ToolExecutionException(FIND_ORDER,
                new DataAccessResourceFailureException("Connection to db-prod-3:5432 refused"));

        assertThat(errors.process(exception))
                .isEqualTo("The findOrder tool is unavailable right now. Say so and do not guess the answer.")
                .doesNotContain("db-prod-3");
    }

    @Test
    void rethrowsCheckedFailures() {
        var exception = new ToolExecutionException(FIND_ORDER, new IOException("disk full"));

        assertThatThrownBy(() -> errors.process(exception)).isSameAs(exception);
    }
}
