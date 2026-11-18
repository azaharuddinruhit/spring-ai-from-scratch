package com.example.support.mcp;

import java.util.Set;

import jakarta.validation.constraints.NotEmpty;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** The MCP tools we reviewed. A tool a server adds later stays hidden from the model until it is listed here. */
@Validated
@ConfigurationProperties("support.mcp")
public record SupportMcpProperties(@NotEmpty Set<String> allowedTools) {
}
