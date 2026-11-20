package com.example.support.chat;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class SupportChatErrorHandler {

    @ExceptionHandler
    ProblemDetail budgetExceeded(TokenBudgetExceededException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS,
                "You have reached today's assistant limit. It resets at midnight UTC.");
    }

    @ExceptionHandler
    ProblemDetail nothingToConfirm(NothingToConfirmException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
    }
}
