package com.example.assistant;

import static java.util.stream.Collectors.joining;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.part.MediaPart;
import org.springframework.ai.chat.messages.part.MessagePart;
import org.springframework.ai.chat.messages.part.ReasoningPart;
import org.springframework.ai.chat.messages.part.TextPart;
import org.springframework.ai.chat.messages.part.ToolCallPart;
import org.springframework.ai.chat.messages.part.ToolResultPart;
import org.springframework.ai.chat.messages.part.UnknownPart;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Service;

import reactor.core.publisher.Flux;

@Service
public class OrderAssistant {

    private static final Logger log = LoggerFactory.getLogger(OrderAssistant.class);

    /** Qwen 3's chat template reads this flag. It has to arrive as a JSON boolean: the string "false" counts as true. */
    private static final Map<String, Object> NO_THINKING = Map.of("chat_template_kwargs", Map.of("enable_thinking", false));

    private final ChatClient assistantChatClient;

    public OrderAssistant(ChatClient assistantChatClient) {
        this.assistantChatClient = assistantChatClient;
    }

    /**
     * The answer and the reasoning behind it, as separate fields; only the answer is meant for the customer. After a tool call
     * the reply is the last model call's, so its reasoning is the reasoning that followed the tool result.
     */
    public Reply reply(String question) {
        AssistantMessage message = assistantChatClient.prompt().user(question).call().chatResponse().getResult().getOutput();
        message.getParts().forEach(part -> log.debug("Reply part: {}", describe(part)));
        String reasoning = message.getReasoning().stream().map(ReasoningPart::text).collect(joining("\n"));
        // Reasoning servers put the answer after a blank line.
        return new Reply(message.getText().strip(), reasoning.strip());
    }

    /** The same call with thinking switched off for this request: faster and cheaper, for questions that need no thought. */
    public String quickReply(String question) {
        return assistantChatClient.prompt()
                .user(question)
                .options(OpenAiChatOptions.builder().extraBody(NO_THINKING))
                .call()
                .content();
    }

    /** Streams the answer's text; reasoning chunks carry no text, so none of it reaches the customer. */
    public Flux<String> streamReply(String question) {
        return assistantChatClient.prompt().user(question).stream().content();
    }

    static String describe(MessagePart part) {
        return switch (part) {
            case TextPart(String text, _, _) -> "text, " + text.length() + " characters";
            case ReasoningPart(String text, _, _, _) -> "reasoning, " + text.length() + " characters";
            case ToolCallPart(AssistantMessage.ToolCall call, _, _) -> "tool call " + call.name() + " " + call.arguments();
            case ToolResultPart result -> "tool result from " + result.name();
            case MediaPart(var media, _, _) -> "media " + media.getMimeType();
            case UnknownPart unknown -> "unknown " + unknown.provider() + " " + unknown.kind();
            // MessagePart isn't sealed, so a provider can add part types of its own.
            default -> part.getClass().getSimpleName();
        };
    }
}
