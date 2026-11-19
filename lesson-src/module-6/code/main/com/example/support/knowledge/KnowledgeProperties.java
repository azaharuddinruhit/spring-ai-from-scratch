package com.example.support.knowledge;

import jakarta.validation.constraints.NotBlank;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** The model that rewrites follow-up questions before the search: a small job for a cheaper model. */
@Validated
@ConfigurationProperties("support.knowledge")
public record KnowledgeProperties(@NotBlank String rewriteModel) {
}
