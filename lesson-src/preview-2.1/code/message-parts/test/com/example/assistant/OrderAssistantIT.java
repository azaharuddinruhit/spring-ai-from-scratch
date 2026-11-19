package com.example.assistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * The whole path against the reasoning model application.yaml points at. It passed against a 27B Qwen 3 reasoning model;
 * deepseek-r1:1.5b on Ollama returned reasoning but never called the tool.
 */
@Tag("ollama")
@SpringBootTest
class OrderAssistantIT {

    @Autowired
    OrderAssistant assistant;

    @MockitoSpyBean
    OrderTools tools;

    @Test
    void theModelReasonsCallsTheToolAndAnswersFromIt() {
        Reply reply = assistant.reply("Where is my order A-1042?");

        verify(tools).findOrder("A-1042");
        assertThat(reply.reasoning()).isNotBlank();
        assertThat(reply.answer()).contains("DHL").doesNotContain(reply.reasoning());
    }

    @Test
    void aQuickReplyStillCallsTheTool() {
        assertThat(assistant.quickReply("Where is my order A-1042?")).contains("DHL");

        verify(tools).findOrder("A-1042");
    }
}
