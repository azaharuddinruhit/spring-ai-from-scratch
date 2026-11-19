package com.example.support.chat;

import java.time.Duration;

import jakarta.validation.constraints.NotNull;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** How long a conversation nobody uses is kept before it is deleted. */
@Validated
@ConfigurationProperties("support.privacy")
public record PrivacyProperties(@NotNull Duration chatRetention) {
}
