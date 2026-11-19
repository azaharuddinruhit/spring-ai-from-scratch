package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import com.example.support.SupportIntegrationTest;
import com.example.support.order.OrderRepository;
import java.util.Locale;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.jdbc.Sql;

@SupportIntegrationTest
@Sql("/orders.sql")
class SupportChatIT {

    @Autowired
    SupportChatService chat;

    @MockitoSpyBean
    OrderRepository orders;

    @Test
    void looksTheOrderUpForTheSignedInCustomer() {
        String answer = chat.ask("alice", UUID.randomUUID(), "billing", "Where is my order 1042?", Locale.ENGLISH).text();

        verify(orders).findForCustomer("alice", "1042"); // the tool ran, with the customer from the ToolContext
        assertThat(answer).contains("1Z999AA10123456784"); // a value only the tool result holds
    }
}
