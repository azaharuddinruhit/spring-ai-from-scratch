package com.example.support.ticket;

import java.util.List;

/** A reply for an agent to send. {@code needsAgent} means the reviewer still had objections after the last round. */
public record ReplyDraft(List<Department> departments, String reply, int rounds, boolean needsAgent) {
}
