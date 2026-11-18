package com.example.support.chat;

import java.security.Principal;
import java.util.Locale;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chats/{chatId}")
class SupportChatController {

    private final SupportChatService chatService;

    SupportChatController(SupportChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/messages")
    AnswerResponse ask(@PathVariable UUID chatId, @Valid @RequestBody AskRequest request, Principal principal, Locale locale) {
        return new AnswerResponse(chatService.ask(principal.getName(), chatId, request.product(), request.question(), locale));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void forget(@PathVariable UUID chatId, Principal principal) {
        chatService.forget(principal.getName(), chatId);
    }

    record AskRequest(@NotBlank @Size(max = 50) String product, @NotBlank @Size(max = 4000) String question) {
    }

    record AnswerResponse(String answer) {
    }
}
