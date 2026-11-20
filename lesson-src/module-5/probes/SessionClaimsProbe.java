import java.time.*;
import java.util.List;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.session.*;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.core.Ordered;

public class SessionClaimsProbe {
    static Prompt last;
    public static void main(String[] a) {
        var repo = InMemorySessionRepository.builder().build();
        var sessions = DefaultSessionService.builder().sessionRepository(repo).defaultTimeToLive(Duration.ofDays(1)).build();
        var client = ChatClient.builder(p -> { last = p; return new ChatResponse(List.of(new Generation(new AssistantMessage("Noted.")))); })
                .defaultSystem("SYS")
                .defaultAdvisors(SessionAdvisors.builder(sessions).memory(m -> m.order(Ordered.HIGHEST_PRECEDENCE + 210)).build()).build();
        client.prompt().user("one").advisors(SessionAdvisors.session("s")).call().content();
        client.prompt().user("two").advisors(SessionAdvisors.session("s")).call().content();
        System.out.println("sent: " + last.getInstructions().stream().map(m -> m.getMessageType() + ":" + m.getText()).toList());
        System.out.println("stored: " + sessions.getMessages("s").stream().map(m -> m.getMessageType() + ":" + m.getText()).toList());
        var s = sessions.findById("s");
        System.out.println("created " + s);
        // A session whose expiry has passed: create one already expired.
        var expired = sessions.create(CreateSessionRequest.builder().id("old").timeToLive(Duration.ofMillis(1)).build());
        try { Thread.sleep(20); } catch (InterruptedException e) {}
        System.out.println("expired findById: " + sessions.findById("old"));
        System.out.println("deleteExpiredSessions: " + sessions.deleteExpiredSessions(Instant.now()) + ", repo still finds s: " + (sessions.findById("s") != null));
    }
}
