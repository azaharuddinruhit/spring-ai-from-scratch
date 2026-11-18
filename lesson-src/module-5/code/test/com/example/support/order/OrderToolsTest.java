package com.example.support.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import com.example.support.tools.CustomerToolContext;
import com.example.support.tools.ToolRefusalException;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;

class OrderToolsTest {

    private static final ToolContext ALICE = new ToolContext(CustomerToolContext.of("alice"));
    private static final Order ORDER_1042 =
            new Order("1042", OrderStatus.SHIPPED, new BigDecimal("59.90"), LocalDate.of(2026, 11, 2), "1Z999AA10123456784");

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderTools tools = new OrderTools(orders);

    @Test
    void findsTheOrderOfTheCustomerInTheToolContext() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(ORDER_1042));

        assertThat(tools.findOrder("1042", ALICE)).isEqualTo(ORDER_1042);
    }

    @Test
    void refusesAnOrderOfAnotherCustomer() {
        given(orders.findForCustomer("alice", "2001")).willReturn(Optional.empty());

        assertThatThrownBy(() -> tools.findOrder("2001", ALICE))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("This customer has no order 2001.");
    }

    @Test
    void keepsTheRequestedCountBetweenOneAndTen() {
        given(orders.findRecentForCustomer("alice", 10)).willReturn(List.of(ORDER_1042));

        assertThat(tools.recentOrders(500, ALICE)).containsExactly(ORDER_1042);
        then(orders).should().findRecentForCustomer("alice", 10);
    }

    @Test
    void theModelCannotChooseTheCustomer() {
        ToolCallback findOrder = Arrays.stream(ToolCallbacks.from(tools))
                .filter(tool -> tool.getToolDefinition().name().equals("findOrder"))
                .findFirst()
                .orElseThrow();

        assertThat(findOrder.getToolDefinition().inputSchema())
                .contains("\"orderNumber\"")
                .doesNotContain("customer", "context");
    }
}
