package com.example.support;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;

/** A chat model that answers from a script and records every prompt. Its options accept tools, like a real provider's. */
public class ScriptedChatModel implements ChatModel {

    private final Function<Prompt, AssistantMessage> script;
    private final List<Prompt> prompts = new CopyOnWriteArrayList<>(); // workers call it from several threads

    public ScriptedChatModel(Function<Prompt, AssistantMessage> script) {
        this.script = script;
    }

    public static AssistantMessage toolCall(String name, String arguments) {
        return AssistantMessage.builder()
                .content("")
                .toolCalls(List.of(new AssistantMessage.ToolCall("call-" + name, "function", name, arguments)))
                .build();
    }

    @Override
    public ChatResponse call(Prompt prompt) {
        prompts.add(prompt);
        return new ChatResponse(List.of(new Generation(script.apply(prompt))));
    }

    @Override
    public ChatOptions getOptions() {
        return ToolCallingChatOptions.builder().build();
    }

    public List<Prompt> prompts() {
        return prompts;
    }
}
