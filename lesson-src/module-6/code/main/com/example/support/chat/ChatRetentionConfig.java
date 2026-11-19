package com.example.support.chat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(PrivacyProperties.class)
class ChatRetentionConfig {

    private static final Logger log = LoggerFactory.getLogger(ChatRetentionConfig.class);

    private final SupportChatService chatService;
    private final PrivacyProperties privacy;

    ChatRetentionConfig(SupportChatService chatService, PrivacyProperties privacy) {
        this.chatService = chatService;
        this.privacy = privacy;
    }

    /** Every instance runs it; deleting the same conversation twice does no harm. */
    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    void deleteIdleChats() {
        int deleted = chatService.forgetIdleChats(privacy.chatRetention());
        log.info("Deleted {} conversations unused for {}", deleted, privacy.chatRetention());
    }
}
