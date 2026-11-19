package com.example.support.routing;

/** Where a ticket goes next. Only ASSISTANT reaches the chat model. */
public enum Route {
    /** Looks like an attempt to change the assistant's instructions: a person reviews it first. */
    REVIEW,
    /** The decision model wasn't sure, or refused: a person reads it. */
    HUMAN,
    /** An unhappy complaint: a person answers it first. */
    PRIORITY_HUMAN,
    REFUND,
    ORDER_STATUS,
    ADDRESS_CHANGE,
    ASSISTANT
}
