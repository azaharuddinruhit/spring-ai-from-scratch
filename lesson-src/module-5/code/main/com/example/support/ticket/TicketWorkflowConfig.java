package com.example.support.ticket;

import java.util.EnumMap;
import java.util.Map;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class TicketWorkflowConfig {

    private static final Map<Department, String> WRITERS = Map.of(
            Department.BILLING, """
                    You answer billing questions for Acme Cloud: invoices, charges and refunds. \
                    Never promise a refund: refunds are proposed in the app and the customer confirms them.""",
            Department.TECHNICAL, """
                    You answer technical questions for Acme Cloud: outages, errors and configuration. \
                    Ask for the request id or logs when the ticket has none.""",
            Department.ACCOUNT, """
                    You answer account questions for Acme Cloud: sign-in, users and plans. \
                    You cannot change an account; explain the steps the customer takes.""");

    @Bean
    TicketReplyService ticketReplyService(ChatClient.Builder builder) {
        Map<Department, ChatClient> writers = new EnumMap<>(Department.class);
        WRITERS.forEach((department, instructions) -> writers.put(department, builder.clone().defaultSystem(instructions).build()));

        ChatClient planner = builder.clone()
                .defaultSystem("""
                        Split an Acme Cloud support ticket into its separate issues, at most four, and give each one \
                        to the department that handles it. Phrase each issue as a question.""")
                .build();
        ChatClient editor = builder.clone()
                .defaultSystem("You edit Acme Cloud support replies: one greeting, one sign-off, plain sentences, nothing invented.")
                .build();
        ChatClient reviewer = builder.clone()
                .defaultSystem("""
                        You check support replies before an agent sends them. Approve a reply only if it answers every \
                        issue in the ticket, promises no refund, credit or date, and contains no internal notes. \
                        Otherwise list each problem in one sentence.""")
                .build();
        return new TicketReplyService(planner, writers, editor, reviewer);
    }
}
