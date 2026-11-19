package com.example.support.chat;

import static com.example.support.ScriptedChatModel.toolCall;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
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
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.DefaultToolCallingManager;

class SupportChatServiceTest {

    private final List<Prompt> prompts = new ArrayList<>();
    private final ChatMemory chatMemory = MessageWindowChatMemory.builder().build();
    private final UUID chatId = UUID.fromString("0f8e2a4c-6b1d-4c3e-9a7f-5d2b8c1e4a60");
    private final SupportChats chats = mock(SupportChats.class);
    private final Instant now = Instant.parse("2026-11-19T10:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);

    private final SupportChatService service = new SupportChatService(
            ChatClient.builder(prompt -> {
                        prompts.add(prompt);
                        return new ChatResponse(List.of(new Generation(new AssistantMessage("Noted."))));
                    })
                    .defaultAdvisors(MessageChatMemoryAdvisor.builder(chatMemory).build())
                    .build(),
            chatMemory, chats, clock);

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
    void conversationIdsFitTheJdbcColumn() {
        String id = SupportChatService.conversationId("alice.long-name@customer.example.com", chatId);

        assertThat(id).hasSize(36).isEqualTo(SupportChatService.conversationId("alice.long-name@customer.example.com", chatId));
    }

    @Test
    void forgetClearsOnlyThatUsersChat() {
        service.ask("alice", chatId, "billing", "Hello", Locale.ENGLISH);
        service.ask("bob", chatId, "billing", "Hello", Locale.ENGLISH);

        service.forget("alice", chatId);

        assertThat(chatMemory.get(SupportChatService.conversationId("alice", chatId))).isEmpty();
        assertThat(chatMemory.get(SupportChatService.conversationId("bob", chatId))).hasSize(2);
    }

    @Test
    void recordsWhoOwnsEachConversation() {
        service.ask("alice", chatId, "billing", "Hello", Locale.ENGLISH);

        then(chats).should().recordUse(SupportChatService.conversationId("alice", chatId), "alice", now);
    }

    @Test
    void forgettingACustomerDeletesAllTheirConversations() {
        chatMemory.add("c1", new UserMessage("My order is 1042."));
        chatMemory.add("c2", new UserMessage("And 1043?"));
        chatMemory.add("c3", new UserMessage("Bob's question"));
        given(chats.ofCustomer("alice")).willReturn(List.of("c1", "c2"));

        assertThat(service.forgetCustomer("alice")).isEqualTo(2);

        assertThat(chatMemory.get("c1")).isEmpty();
        assertThat(chatMemory.get("c2")).isEmpty();
        assertThat(chatMemory.get("c3")).hasSize(1);
        then(chats).should().delete("c1");
        then(chats).should().delete("c2");
    }

    @Test
    void forgetsConversationsUnusedForTheRetentionPeriod() {
        chatMemory.add("old", new UserMessage("Hello"));
        given(chats.idleSince(now.minus(Duration.ofDays(30)))).willReturn(List.of("old"));

        assertThat(service.forgetIdleChats(Duration.ofDays(30))).isEqualTo(1);
        assertThat(chatMemory.get("old")).isEmpty();
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
        var service = new SupportChatService(ChatClient.builder(model).defaultTools(new OrderTools(orders)).build(), chatMemory, chats, clock);

        assertThat(service.ask("alice", chatId, "billing", "Where is order 1042?", Locale.ENGLISH).text())
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
                chatMemory, chats, clock);

        assertThat(service.ask("alice", chatId, "billing", "Show my orders", Locale.ENGLISH).text())
                .isEqualTo(SupportChatService.TOOL_LIMIT_ANSWER);
        assertThat(model.prompts()).hasSize(4);
    }
}
