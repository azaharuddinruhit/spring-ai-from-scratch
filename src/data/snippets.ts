import { STACK, type Stack } from './versions';

/** The dependencies block of a Spring Boot 4 web app with the given Spring AI starters (versions come from the BOM). */
export function gradleDependencies(starters: string[]): string {
  const starterLines = starters.map((s) => `    implementation 'org.springframework.ai:${s}'`).join('\n');
  return `dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'
${starterLines}
    testImplementation 'org.springframework.boot:spring-boot-starter-webmvc-test'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}`;
}

/** A complete Groovy DSL build file for a Spring Boot 4 + Spring AI 2 web app. */
export function buildGradle(starters: string[], stack: Stack = STACK): string {
  return `plugins {
    id 'java'
    id 'org.springframework.boot' version '${stack.springBoot}'
    id 'io.spring.dependency-management' version '${stack.dependencyManagementPlugin}'
}

group = 'com.example'
version = '0.0.1-SNAPSHOT'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${stack.java})
    }
}

repositories {
    mavenCentral()
}

dependencyManagement {
    imports {
        mavenBom "org.springframework.ai:spring-ai-bom:${stack.springAi}"
    }
}

${gradleDependencies(starters)}

tasks.named('test') {
    useJUnitPlatform()
}
`;
}

export interface Provider {
  id: string;
  name: string;
  starter: string;
  /** The spring.ai section of application.yml, indented to sit under `spring:`. */
  aiYaml: string;
  /** Environment variables the learner must export before running. */
  env: string[];
  note: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    starter: 'spring-ai-starter-model-openai',
    aiYaml: `  ai:
    openai:
      api-key: \${OPENAI_API_KEY}
      chat:
        model: gpt-5-mini`,
    env: ['OPENAI_API_KEY'],
    note: 'GPT-5 models reject the temperature option, so leave it unset unless you pick a chat model such as gpt-4o.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    starter: 'spring-ai-starter-model-anthropic',
    aiYaml: `  ai:
    anthropic:
      api-key: \${ANTHROPIC_API_KEY}
      chat:
        model: claude-haiku-4-5
        max-tokens: 4096`,
    env: ['ANTHROPIC_API_KEY'],
    note: 'In 2.0 the module is built on the official anthropic-java SDK, and the default max-tokens rose from 500 to 4096.',
  },
  {
    id: 'google-genai',
    name: 'Google GenAI',
    starter: 'spring-ai-starter-model-google-genai',
    aiYaml: `  ai:
    google:
      genai:
        api-key: \${GEMINI_API_KEY}
        chat:
          model: gemini-2.5-flash`,
    env: ['GEMINI_API_KEY'],
    note: 'Set an api-key to use the Gemini Developer API. To use Vertex AI, replace it with project-id and location.',
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    starter: 'spring-ai-starter-model-bedrock-converse',
    aiYaml: `  ai:
    bedrock:
      aws:
        region: us-east-1
        access-key: \${AWS_ACCESS_KEY_ID}
        secret-key: \${AWS_SECRET_ACCESS_KEY}
      converse:
        chat:
          model: us.anthropic.claude-haiku-4-5-20251001-v1:0`,
    env: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    note: 'Bedrock has no default model. Use a model or inference-profile ID that is enabled in your AWS account.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    starter: 'spring-ai-starter-model-deepseek',
    aiYaml: `  ai:
    deepseek:
      api-key: \${DEEPSEEK_API_KEY}
      chat:
        model: deepseek-v4-flash`,
    env: ['DEEPSEEK_API_KEY'],
    note: 'deepseek-v4-pro and deepseek-reasoner are also available if you need more reasoning ability.',
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    starter: 'spring-ai-starter-model-ollama',
    aiYaml: `  ai:
    ollama:
      base-url: http://localhost:11434
      init:
        pull-model-strategy: when_missing
      chat:
        model: qwen3:8b`,
    env: [],
    note: 'Runs fully offline. With when_missing, the model is pulled on first startup, so that first boot is slow.',
  },
  {
    id: 'docker-model-runner',
    name: 'Docker Model Runner',
    starter: 'spring-ai-starter-model-openai',
    aiYaml: `  ai:
    model:
      embedding: none
    openai:
      api-key: not-used
      base-url: http://localhost:12434/engines/v1
      chat:
        model: ai/gemma3`,
    env: [],
    note: 'Uses the OpenAI starter with Docker\'s OpenAI-compatible endpoint. Enable it with: docker desktop enable model-runner --tcp 12434',
  },
];

export function applicationYaml(provider: Provider): string {
  return `spring:
  application:
    name: assistant
  threads:
    virtual:
      enabled: true
${provider.aiYaml}
`;
}

export const ASSISTANT_SERVICE = `package com.example.assistant;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

@Service
public class AssistantService {

    private final ChatClient chatClient;

    public AssistantService(ChatClient.Builder builder) {
        this.chatClient = builder
                .defaultSystem("You are a concise assistant for Java developers.")
                .build();
    }

    public String ask(String question) {
        return chatClient.prompt()
                .user(question)
                .call()
                .content();
    }
}
`;
