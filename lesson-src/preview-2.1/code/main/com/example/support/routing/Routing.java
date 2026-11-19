package com.example.support.routing;

/** The route a ticket takes, and why, in words a log line or a reviewer can read. */
public record Routing(Route route, String reason) {}
