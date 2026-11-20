package com.example.support.chat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
class ChatRetentionConfig {

    private static final Logger log = LoggerFactory.getLogger(ChatRetentionConfig.class);

    private final SupportChatService chatService;

    ChatRetentionConfig(SupportChatService chatService) {
        this.chatService = chatService;
    }

    /** Spring AI doesn't sweep expired sessions itself. Every instance runs it; a session is deleted once. */
    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    void deleteExpiredChats() {
        log.info("Deleted {} expired conversations", chatService.forgetExpiredChats());
    }
}
