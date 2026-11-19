package com.example.support.chat;

public class TokenBudgetExceededException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public TokenBudgetExceededException(String userId, long dailyTokens) {
        super("User " + userId + " has used the daily budget of " + dailyTokens + " tokens");
    }
}
