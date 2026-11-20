package com.example.support.chat;

import static com.example.support.ScriptedChatModel.toolCall;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
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
import com.example.support.refund.Refund;
import com.example.support.refund.RefundService;
import com.example.support.refund.RefundTools;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.DefaultToolCallingManager;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.SessionAttributes;
import org.springframework.ai.session.SessionService;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.core.Ordered;

class SupportChatServiceTest {

    private final List<Prompt> prompts = new ArrayList<>();
    private final SessionService sessionService = DefaultSessionService.builder()
            .sessionRepository(InMemorySessionRepository.builder().build())
            .defaultTimeToLive(Duration.ofDays(30))
            .build();
    private final UUID chatId = UUID.fromString("0f8e2a4c-6b1d-4c3e-9a7f-5d2b8c1e4a60");
    private final Clock clock = Clock.systemUTC();

    private final ChatClient chatClient = ChatClient.builder(prompt -> {
                prompts.add(prompt);
                return new ChatResponse(List.of(new Generation(new AssistantMessage("Noted."))));
            })
            .defaultAdvisors(SessionAdvisors.builder(sessionService)
                    .memory(memory -> memory.order(Ordered.HIGHEST_PRECEDENCE + 210))
                    .build())
            .build();

    private final RefundService refunds = mock(RefundService.class);
    private final SupportTools tools = new SupportTools(new OrderTools(mock(OrderRepository.class)), new RefundTools(refunds),
            ToolCallbackProvider.from(List.of()));
    private ScriptedChatModel refundModel;

    private final SupportChatService service = service(chatClient, clock);

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
    void aNewSessionRecordsItsOwner() {
        service.ask("alice", chatId, "billing", "Hello", Locale.ENGLISH);

        assertThat(SessionAttributes.principalName(sessionService.findById(SupportChatService.sessionId("alice", chatId))))
                .isEqualTo("alice");
    }

    @Test
    void forgettingACustomerDeletesAllTheirSessions() {
        UUID otherChat = UUID.fromString("7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f");
        service.ask("alice", chatId, "billing", "My order is 1042.", Locale.ENGLISH);
        service.ask("alice", otherChat, "billing", "And 1043?", Locale.ENGLISH);
        service.ask("bob", chatId, "billing", "Bob's question", Locale.ENGLISH);

        assertThat(service.forgetCustomer("alice")).isEqualTo(2);

        assertThat(sessionService.findByMetadata(SessionAttributes.PRINCIPAL_NAME, "alice")).isEmpty();
        assertThat(sessionService.getMessages(SupportChatService.sessionId("bob", chatId))).hasSize(2);
    }

    @Test
    void forgetsSessionsPastTheirTimeToLive() {
        service.ask("alice", chatId, "billing", "Hello", Locale.ENGLISH);
        var aMonthLater = service(chatClient, Clock.offset(clock, Duration.ofDays(31)));

        assertThat(service.forgetExpiredChats()).isZero();
        assertThat(aMonthLater.forgetExpiredChats()).isEqualTo(1);
        assertThat(sessionService.findById(SupportChatService.sessionId("alice", chatId))).isNull();
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
        var service = service(ChatClient.builder(model).defaultTools(new OrderTools(orders)).build(), clock);

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
        var service = service(
                ChatClient.builder(model).defaultAdvisors(limited).defaultTools(new OrderTools(mock(OrderRepository.class))).build(), clock);

        assertThat(service.ask("alice", chatId, "billing", "Show my orders", Locale.ENGLISH).text())
                .isEqualTo(SupportChatService.TOOL_LIMIT_ANSWER);
        assertThat(model.prompts()).hasSize(4);
    }

    @Test
    void aRefundWaitsForTheCustomersConfirmation() {
        var service = service(refundingClient(), clock);

        assertThat(service.ask("alice", chatId, "billing", "Order 1042 arrived broken.", Locale.ENGLISH).text())
                .isEqualTo(SupportChatService.CONFIRMATION_ANSWER);

        then(refunds).shouldHaveNoInteractions();
        assertThat(service.awaitingConfirmation("alice", chatId))
                .singleElement()
                .satisfies(call -> assertThat(call.name()).isEqualTo("refundOrder"));
        assertThat(service.awaitingConfirmation("bob", chatId)).isEmpty();
    }

    @Test
    void aConfirmedRefundRunsOnceAndTheModelAnswers() {
        // The model's 59.90 arrives as 59.9: compare amounts with compareTo, as RefundService does.
        given(refunds.refund(eq("alice"), eq("1042"), argThat(amount -> amount.compareTo(new BigDecimal("59.90")) == 0),
                eq("Arrived broken")))
                .willReturn(new Refund(UUID.randomUUID(), "alice", "1042", new BigDecimal("59.90"), "Arrived broken"));
        var service = service(refundingClient(), clock);
        service.ask("alice", chatId, "billing", "Order 1042 arrived broken.", Locale.ENGLISH);

        assertThat(service.confirm("alice", chatId, true, Locale.ENGLISH).text()).isEqualTo("Your refund is on its way.");

        then(refunds).should().refund(eq("alice"), eq("1042"), any(), eq("Arrived broken"));
        assertThat(sessionService.getMessages(SupportChatService.sessionId("alice", chatId)))
                .extracting(Message::getMessageType)
                .containsExactly(MessageType.USER, MessageType.ASSISTANT, MessageType.TOOL, MessageType.ASSISTANT);
        assertThatThrownBy(() -> service.confirm("alice", chatId, true, Locale.ENGLISH))
                .isInstanceOf(NothingToConfirmException.class);
    }

    @Test
    void aDeclinedRefundNeverRuns() {
        var service = service(refundingClient(), clock);
        service.ask("alice", chatId, "billing", "Order 1042 arrived broken.", Locale.ENGLISH);

        service.confirm("alice", chatId, false, Locale.ENGLISH);

        then(refunds).shouldHaveNoInteractions();
        assertThat(lastToolResult()).contains(SupportChatService.DECLINED);
    }

    @Test
    void aNewMessageClosesTheConfirmation() {
        var service = service(refundingClient(), clock);
        service.ask("alice", chatId, "billing", "Order 1042 arrived broken.", Locale.ENGLISH);

        service.ask("alice", chatId, "billing", "Actually, never mind.", Locale.ENGLISH);

        assertThat(service.awaitingConfirmation("alice", chatId)).isEmpty();
        then(refunds).shouldHaveNoInteractions();
    }

    /** Asks to refund order 1042 when it arrived broken, and answers once it gets the tool result. */
    private ChatClient refundingClient() {
        refundModel = new ScriptedChatModel(prompt -> prompt.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("Your refund is on its way.")
                : !prompt.getUserMessage().getText().contains("broken")
                ? new AssistantMessage("Okay.")
                : toolCall("refundOrder", """
                        {
                          "orderNumber": "1042",
                          "amount": 59.90,
                          "reason": "Arrived broken"
                        }"""));
        return ChatClient.builder(refundModel)
                .defaultAdvisors(new PiiRedactionAdvisor(), new AnswerLanguageAdvisor())
                .defaultAdvisors(SessionAdvisors.builder(sessionService)
                        .memory(memory -> memory.order(Ordered.HIGHEST_PRECEDENCE + 210))
                        .build())
                .defaultTools(tools.orders(), tools.refunds(), tools.shipping())
                .build();
    }

    private String lastToolResult() {
        var results = (ToolResponseMessage) refundModel.prompts().getLast().getInstructions().getLast();
        return results.getResponses().getFirst().responseData();
    }

    private SupportChatService service(ChatClient chatClient, Clock clock) {
        return new SupportChatService(chatClient, sessionService, ToolCallingManager.builder().build(), tools, clock);
    }
}
