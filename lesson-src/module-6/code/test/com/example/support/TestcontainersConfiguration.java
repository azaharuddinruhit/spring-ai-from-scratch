package com.example.support;

import java.util.List; // probe-only
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.ollama.OllamaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Real PostgreSQL with pgvector, and a real model in Ollama. {@code @ServiceConnection} sets the URLs. */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer(DockerImageName.parse("pgvector/pgvector:pg17").asCompatibleSubstituteFor("postgres"));
    }

    @Bean
    @ServiceConnection
    OllamaContainer ollama() {
        // Kept between runs when ~/.testcontainers.properties says testcontainers.reuse.enable=true, so the models
        // download once on your machine. CI never reuses, so cache the models there (see the gotchas).
        return new OllamaContainer("ollama/ollama:0.40.16")
                .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withDeviceRequests(List.of())) // probe-only
                .withReuse(true);
    }
}
