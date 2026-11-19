package com.example.support.ticket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import java.util.List;

import com.example.support.security.SecurityConfig;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@WebMvcTest(TicketController.class)
@Import(SecurityConfig.class)
class TicketControllerTest {

    private static final RequestPostProcessor AGENT = jwt().authorities(new SimpleGrantedAuthority("SCOPE_support.agent"));

    @Autowired
    private MockMvcTester mvc;

    @MockitoBean
    private TicketReplyService replies;

    @Test
    void draftsAReply() {
        given(replies.draftReply("Charged twice", "My card was charged twice."))
                .willReturn(new ReplyDraft(List.of(Department.BILLING), "A refund is waiting in the app.", 2, false));

        assertThat(mvc.post().uri("/api/tickets/reply-drafts")
                .with(AGENT)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "subject": "Charged twice",
                          "body": "My card was charged twice."
                        }
                        """))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {
                          "departments": [
                            "BILLING"
                          ],
                          "reply": "A refund is waiting in the app.",
                          "rounds": 2,
                          "needsAgent": false
                        }
                        """);
    }

    @Test
    void rejectsAnEmptyTicket() {
        assertThat(mvc.post().uri("/api/tickets/reply-drafts")
                .with(AGENT)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "subject": "Help",
                          "body": ""
                        }
                        """))
                .hasStatus(HttpStatus.BAD_REQUEST);
        then(replies).shouldHaveNoInteractions();
    }

    @Test
    void isNotOpenToCustomers() {
        assertThat(mvc.post().uri("/api/tickets/reply-drafts")
                .with(jwt().jwt(token -> token.subject("alice")))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "subject": "Charged twice",
                          "body": "My card was charged twice."
                        }
                        """))
                .hasStatus(HttpStatus.FORBIDDEN);
        then(replies).shouldHaveNoInteractions();
    }
}
