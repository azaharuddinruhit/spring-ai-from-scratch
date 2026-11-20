package com.example.support.chat;

import java.security.Principal;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats")
class SupportChatController {

    private final SupportChatService chatService;

    SupportChatController(SupportChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/{chatId}/messages")
    AnswerResponse ask(@PathVariable UUID chatId, @Valid @RequestBody AskRequest request, Principal principal, Locale locale) {
        return new AnswerResponse(chatService.ask(principal.getName(), chatId, request.product(), request.question(), locale).text());
    }

    /** What the model wants to do and waits for the customer to confirm: tool names and the exact arguments. */
    @GetMapping("/{chatId}/confirmation")
    List<PendingCall> awaitingConfirmation(@PathVariable UUID chatId, Principal principal) {
        return chatService.awaitingConfirmation(principal.getName(), chatId).stream()
                .map(call -> new PendingCall(call.name(), call.arguments()))
                .toList();
    }

    @PostMapping("/{chatId}/confirmation")
    AnswerResponse confirm(@PathVariable UUID chatId, @Valid @RequestBody ConfirmRequest request, Principal principal,
                           Locale locale) {
        return new AnswerResponse(chatService.confirm(principal.getName(), chatId, request.approved(), locale).text());
    }

    @DeleteMapping("/{chatId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void forget(@PathVariable UUID chatId, Principal principal) {
        chatService.forget(principal.getName(), chatId);
    }

    /** Deletes every conversation of the signed-in customer. */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void forgetAll(Principal principal) {
        chatService.forgetCustomer(principal.getName());
    }

    record AskRequest(@NotBlank @Size(max = 50) String product, @NotBlank @Size(max = 4000) String question) {
    }

    record AnswerResponse(String answer) {
    }

    record PendingCall(String tool, String arguments) {
    }

    record ConfirmRequest(@NotNull Boolean approved) {
    }
}
