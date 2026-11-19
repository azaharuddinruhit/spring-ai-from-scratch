package com.example.shipping;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class McpSecurityConfig {

    @Bean
    SecurityFilterChain mcpSecurity(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/mcp").hasAuthority("SCOPE_mcp")
                        .anyRequest().denyAll())
                .oauth2ResourceServer(server -> server.jwt(Customizer.withDefaults()))
                .csrf(AbstractHttpConfigurer::disable) // bearer tokens only: no session cookie to forge
                .build();
    }
}
