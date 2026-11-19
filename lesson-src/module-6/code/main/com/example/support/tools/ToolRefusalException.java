package com.example.support.tools;

/** A tool turned the request down for a reason the model may read and repeat, such as an unknown order number. */
public class ToolRefusalException extends RuntimeException {

    public ToolRefusalException(String message) {
        super(message);
    }
}
