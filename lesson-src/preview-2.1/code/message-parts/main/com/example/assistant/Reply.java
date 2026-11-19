package com.example.assistant;

/** The answer for the customer, and the model's reasoning kept apart from it. */
public record Reply(String answer, String reasoning) {
}
