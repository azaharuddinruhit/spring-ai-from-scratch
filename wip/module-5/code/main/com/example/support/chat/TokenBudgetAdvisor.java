package com.example.support.chat;

import java.time.Clock;
import java.time.LocalDate;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.CallAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain;
import org.springframework.core.Ordered;
import org.springframework.util.Assert;

/** Refuses a user's calls once they have spent their daily token budget. */
public final class TokenBudgetAdvisor implements CallAdvisor {

    public static final String USER_ID = "support.user-id";

    private final long dailyTokens;
    private final Clock clock;
    private final ConcurrentMap<String, DailySpend> spend = new ConcurrentHashMap<>();

    public TokenBudgetAdvisor(long dailyTokens, Clock clock) {
        this.dailyTokens = dailyTokens;
        this.clock = clock;
    }

    @Override
    public String getName() {
        return "TokenBudgetAdvisor";
    }

    @Override
    public int getOrder() {
        // Outside memory and the tool loop: a refused call stores nothing, and the usage covers every tool round trip.
        return Ordered.HIGHEST_PRECEDENCE + 50;
    }

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        Object userId = request.context().get(USER_ID);
        Assert.state(userId != null, () -> USER_ID + " advisor parameter is required");
        LocalDate today = LocalDate.now(clock);
        DailySpend current = spend.get(userId.toString());
        if (current != null && current.day().equals(today) && current.tokens() >= dailyTokens) {
            throw new TokenBudgetExceededException(userId.toString(), dailyTokens);
        }
        ChatClientResponse response = chain.nextCall(request);
        long used = response.chatResponse().getMetadata().getUsage().getTotalTokens();
        spend.merge(userId.toString(), new DailySpend(today, used), DailySpend::plus);
        return response;
    }

    private record DailySpend(LocalDate day, long tokens) {

        DailySpend plus(DailySpend next) {
            return day.equals(next.day) ? new DailySpend(day, tokens + next.tokens) : next;
        }
    }
}
