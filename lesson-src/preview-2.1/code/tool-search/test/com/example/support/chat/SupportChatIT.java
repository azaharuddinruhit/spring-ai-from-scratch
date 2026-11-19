package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;

import com.example.support.tools.SupportTools;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * The whole path against the chat model application.yaml points at. The answer alone proves nothing: when a search found no
 * tool, llama3.2:3b still said "out of stock". So the test checks that the stock tool really ran. It passed 3 times out of 3
 * with a 27B Qwen 3 model; llama3.2:3b found checkStock and answered without calling it, 5 times out of 5.
 */
@Tag("ollama")
@SpringBootTest
class SupportChatIT {

    @Autowired
    SupportChatService service;

    @MockitoSpyBean
    SupportTools tools;

    @Test
    void theModelFindsTheStockToolAndAnswersFromIt() {
        String answer = service.answer("it-1", "Is the PB-200 blender in stock?");

        verify(tools).checkStock(anyString());
        assertThat(answer).containsIgnoringCase("out of stock");
    }
}
