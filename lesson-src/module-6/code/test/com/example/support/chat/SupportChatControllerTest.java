package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.example.support.chat.SupportChatService.SupportAnswer;
import com.example.support.security.SecurityConfig;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@WebMvcTest(SupportChatController.class)
@Import(SecurityConfig.class)
class SupportChatControllerTest {

    private static final UUID CHAT_ID = UUID.fromString("0f8e2a4c-6b1d-4c3e-9a7f-5d2b8c1e4a60");

    @Autowired
    private MockMvcTester mvc;

    @MockitoBean
    private SupportChatService chatService;

    @Test
    void answersInTheCallersLanguage() {
        given(chatService.ask("alice", CHAT_ID, "billing", "Wo ist Bestellung 1042?", Locale.GERMAN)).willReturn(new SupportAnswer("Unterwegs.", List.of()));

        assertThat(mvc.post().uri("/api/chats/{chatId}/messages", CHAT_ID)
                .with(jwt().jwt(token -> token.subject("alice")))
                .header(HttpHeaders.ACCEPT_LANGUAGE, "de")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "product": "billing",
                          "question": "Wo ist Bestellung 1042?"
                        }
                        """))
                .hasStatusOk()
                .bodyJson().extractingPath("$.answer").isEqualTo("Unterwegs.");
    }

    @Test
    void rejectsABlankQuestion() {
        assertThat(mvc.post().uri("/api/chats/{chatId}/messages", CHAT_ID)
                .with(jwt().jwt(token -> token.subject("alice")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "product": "billing",
                          "question": " "
                        }
                        """))
                .hasStatus(HttpStatus.BAD_REQUEST);
        then(chatService).shouldHaveNoInteractions();
    }

    @Test
    void reportsAnExhaustedBudgetAs429() {
        given(chatService.ask("alice", CHAT_ID, "billing", "Hi", Locale.ENGLISH))
                .willThrow(new TokenBudgetExceededException("alice", 200_000));

        assertThat(mvc.post().uri("/api/chats/{chatId}/messages", CHAT_ID)
                .with(jwt().jwt(token -> token.subject("alice")))
                .header(HttpHeaders.ACCEPT_LANGUAGE, "en")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "product": "billing",
                          "question": "Hi"
                        }
                        """))
                .hasStatus(HttpStatus.TOO_MANY_REQUESTS)
                .bodyJson().extractingPath("$.detail").isEqualTo("You have reached today's assistant limit. It resets at midnight UTC.");
    }

    @Test
    void forgetsAllChatsOfTheSignedInCustomer() {
        assertThat(mvc.delete().uri("/api/chats").with(jwt().jwt(token -> token.subject("alice"))))
                .hasStatus(HttpStatus.NO_CONTENT);
        then(chatService).should().forgetCustomer("alice");
    }

    @Test
    void forgetsAChat() {
        assertThat(mvc.delete().uri("/api/chats/{chatId}", CHAT_ID).with(jwt().jwt(token -> token.subject("alice"))))
                .hasStatus(HttpStatus.NO_CONTENT);
        then(chatService).should().forget("alice", CHAT_ID);
    }
}
