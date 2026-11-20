package com.example.support.chat;

public class NothingToConfirmException extends RuntimeException {

    public NothingToConfirmException() {
        super("Nothing in this chat is waiting for a confirmation");
    }
}
