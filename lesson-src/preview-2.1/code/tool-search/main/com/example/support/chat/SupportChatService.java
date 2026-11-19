package com.example.support.chat;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

/** Answers a customer through the chat client; tool search keeps one tool index per session. */
@Service
public class SupportChatService {

    /** The context key the tool search advisor reads the session from (application.yaml sets it). */
    public static final String SESSION_ID = "support_session_id";

    private final ChatClient supportChatClient;

    public SupportChatService(ChatClient supportChatClient) {
        this.supportChatClient = supportChatClient;
    }

    public String answer(String sessionId, String question) {
        return supportChatClient.prompt()
                .user(question)
                .advisors(a -> a.param(SESSION_ID, sessionId))
                .call()
                .content();
    }
}
