package com.example.support.chat;

import static com.example.support.ScriptedChatModel.toolCall;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import com.example.support.ScriptedChatModel;
import com.example.support.order.Order;
import com.example.support.order.OrderRepository;
import com.example.support.order.OrderStatus;
import com.example.support.order.OrderTools;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.DefaultToolCallingManager;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.SessionService;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.core.Ordered;

class SupportChatServiceTest {

    private final List<Prompt> prompts = new ArrayList<>();
    private final SessionService sessionService = DefaultSessionService.builder()
            .sessionRepository(InMemorySessionRepository.builder().build())
            .build();
    private final UUID chatId = UUID.fromString("0f8e2a4c-6b1d-4c3e-9a7f-5d2b8c1e4a60");

    private final SupportChatService service = new SupportChatService(ChatClient.builder(prompt -> {
                prompts.add(prompt);
                return new ChatResponse(List.of(new Generation(new AssistantMessage("Noted."))));
            })
            .defaultAdvisors(SessionAdvisors.builder(sessionService)
                    .memory(memory -> memory.order(Ordered.HIGHEST_PRECEDENCE + 210))
                    .build())
            .build(),
            sessionService);

    @Test
    void usersWithTheSameChatIdDoNotShareAConversation() {
        service.ask("alice", chatId, "billing", "My order number is 1042.", Locale.ENGLISH);
        service.ask("bob", chatId, "billing", "What is my order number?", Locale.ENGLISH);

        assertThat(prompts.getLast().getInstructions())
                .extracting(Message::getText)
                .containsExactly("What is my order number?");
    }

    @Test
    void aUserSeesTheirOwnHistory() {
        service.ask("alice", chatId, "billing", "My order number is 1042.", Locale.ENGLISH);
        service.ask("alice", chatId, "billing", "What is my order number?", Locale.ENGLISH);

        assertThat(prompts.getLast().getInstructions())
                .extracting(Message::getText)
                .containsExactly("My order number is 1042.", "Noted.", "What is my order number?");
    }

    @Test
    void sessionIdsBelongToOneUsersChat() {
        assertThat(SupportChatService.sessionId("alice", chatId))
                .isEqualTo(SupportChatService.sessionId("alice", chatId))
                .isNotEqualTo(SupportChatService.sessionId("bob", chatId));
    }

    @Test
    void forgetDeletesOnlyThatUsersSession() {
        service.ask("alice", chatId, "billing", "Hello", Locale.ENGLISH);
        service.ask("bob", chatId, "billing", "Hello", Locale.ENGLISH);

        service.forget("alice", chatId);

        assertThat(sessionService.findById(SupportChatService.sessionId("alice", chatId))).isNull();
        assertThat(sessionService.getMessages(SupportChatService.sessionId("bob", chatId))).hasSize(2);
    }

    @Test
    void toolsLookUpTheSignedInCustomersOrders() {
        OrderRepository orders = mock(OrderRepository.class);
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(
                new Order("1042", OrderStatus.SHIPPED, new BigDecimal("59.90"), LocalDate.of(2026, 11, 2), "1Z999AA10123456784")));
        var model = new ScriptedChatModel(prompt -> prompt.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("Order 1042 has shipped.")
                : toolCall("findOrder", """
                        {
                          "orderNumber": "1042",
                          "customerId": "bob"
                        }"""));
        var service = new SupportChatService(ChatClient.builder(model).defaultTools(new OrderTools(orders)).build(), sessionService);

        assertThat(service.ask("alice", chatId, "billing", "Where is order 1042?", Locale.ENGLISH))
                .isEqualTo("Order 1042 has shipped.");
        then(orders).should().findForCustomer("alice", "1042");
    }

    @Test
    void stopsARunawayToolLoop() {
        var model = new ScriptedChatModel(prompt -> toolCall("recentOrders", """
                {
                  "count": 5
                }"""));
        var limited = ToolCallingAdvisor.builder()
                .toolCallingManager(DefaultToolCallingManager.builder().maxCallsPerTool(3).build())
                .build();
        var service = new SupportChatService(
                ChatClient.builder(model).defaultAdvisors(limited).defaultTools(new OrderTools(mock(OrderRepository.class))).build(),
                sessionService);

        assertThat(service.ask("alice", chatId, "billing", "Show my orders", Locale.ENGLISH))
                .isEqualTo(SupportChatService.TOOL_LIMIT_ANSWER);
        assertThat(model.prompts()).hasSize(4);
    }
}
