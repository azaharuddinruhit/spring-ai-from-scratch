package com.example.probe;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;

/**
 * Which model a request carries when runtime options set only a temperature: through ChatModel.call(Prompt) and through
 * ChatClient.options(). Compiled and run against 2.0.2 (Module 6 classpath) and 2.1.0-RC2; the logging proxy records the model.
 */
@SpringBootApplication
public class OptionsMergeProbe {

    public static void main(String[] args) {
        try (var context = new SpringApplicationBuilder(OptionsMergeProbe.class).web(WebApplicationType.NONE).run(args)) {
            ChatModel chatModel = context.getBean(ChatModel.class);
            run("ChatModel.call(Prompt, options)",
                    () -> chatModel.call(new Prompt("Say OK.", OpenAiChatOptions.builder().temperature(0.2).build())).getMetadata().getModel());
            run("ChatClient.options(builder)", () -> ChatClient.create(chatModel).prompt("Say OK.")
                    .options(OpenAiChatOptions.builder().temperature(0.2)).call().chatResponse().getMetadata().getModel());
        }
    }

    private static void run(String label, java.util.function.Supplier<String> call) {
        try {
            System.out.println("PROBE " + label + ": ok, model " + call.get());
        } catch (RuntimeException e) {
            System.out.println("PROBE " + label + ": " + e.getClass().getSimpleName() + " " + e.getMessage().replaceAll("model=[^ ]+", "model=<x>"));
        }
    }
}
