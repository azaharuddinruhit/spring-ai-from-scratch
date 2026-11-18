package com.example.support.ticket;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tickets")
class TicketController {

    private final TicketReplyService replies;

    TicketController(TicketReplyService replies) {
        this.replies = replies;
    }

    @PostMapping("/reply-drafts")
    ReplyDraft draftReply(@Valid @RequestBody TicketRequest ticket) {
        return replies.draftReply(ticket.subject(), ticket.body());
    }

    record TicketRequest(@NotBlank @Size(max = 200) String subject, @NotBlank @Size(max = 8000) String body) {
    }
}
