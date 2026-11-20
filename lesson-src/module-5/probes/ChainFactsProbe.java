import java.util.ArrayList;
import java.util.List;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.SafeGuardAdvisor;
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.client.advisor.api.AdvisorChain;
import org.springframework.ai.chat.client.advisor.api.BaseAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.ai.tool.annotation.Tool;
import reactor.core.publisher.Flux;

/** Module 3 facts on 2.1.0: default orders, equal orders, streaming, SafeGuardAdvisor and session memory in the tool loop. */
public class ChainFactsProbe {

    static final List<String> trace = new ArrayList<>();

    record Named(String name, int order) implements BaseAdvisor {
        public ChatClientRequest before(ChatClientRequest r, AdvisorChain c) { trace.add(name + ".before"); return r; }
        public ChatClientResponse after(ChatClientResponse r, AdvisorChain c) { return r; }
        public int getOrder() { return order; }
        public String getName() { return name; }
    }

    record CallOnly(String name) implements CallAdvisor {
        public ChatClientResponse adviseCall(ChatClientRequest r, CallAdvisorChain chain) { trace.add(name); return chain.nextCall(r); }
        public int getOrder() { return 0; }
        public String getName() { return name; }
    }

    public static class Tools {
        @Tool(description = "Look up an order")
        public String lookup(String orderNumber) { return "order " + orderNumber + " shipped"; }
    }

    static ChatModel model(java.util.function.Function<Prompt, AssistantMessage> f) {
        return new ChatModel() {
            public ChatResponse call(Prompt p) { return new ChatResponse(List.of(new Generation(f.apply(p)))); }
            public Flux<ChatResponse> stream(Prompt p) { return Flux.just(call(p)); }
            public ChatOptions getOptions() { return ToolCallingChatOptions.builder().build(); }
        };
    }

    public static void main(String[] args) {
        var sessions = DefaultSessionService.builder().sessionRepository(InMemorySessionRepository.builder().build()).build();
        System.out.println("order SimpleLoggerAdvisor " + new SimpleLoggerAdvisor().getOrder());
        System.out.println("order SafeGuardAdvisor " + SafeGuardAdvisor.builder().sensitiveWords(List.of("x")).build().getOrder());
        System.out.println("order RetrievalAugmentationAdvisor " + RetrievalAugmentationAdvisor.builder().documentRetriever(q -> List.of()).build().getOrder());
        System.out.println("order ToolCallingAdvisor " + (ToolCallingAdvisor.builder().build().getOrder() - Integer.MIN_VALUE) + " above HIGHEST");
        SessionAdvisors.builder(sessions).build().forEach(a -> System.out.println("order " + a.getName() + " " + (a.getOrder() - Integer.MIN_VALUE) + " above HIGHEST"));

        // Equal orders: A registered before B.
        var plain = model(p -> new AssistantMessage("ok"));
        ChatClient.builder(plain).defaultAdvisors(new Named("A", 0), new Named("B", 0)).build().prompt().user("hi").call().content();
        System.out.println("equal orders ran: " + trace);
        trace.clear();
        ChatClient.builder(plain).defaultAdvisors(new CallOnly("callOnly"), new Named("base", 0)).build().prompt().user("hi").stream().content().blockLast();
        System.out.println("stream ran: " + trace);
        trace.clear();

        // SafeGuardAdvisor with a sensitive word in the stored history only.
        var guarded = ChatClient.builder(plain)
                .defaultAdvisors(SessionAdvisors.builder(sessions).build())
                .defaultAdvisors(SafeGuardAdvisor.builder().sensitiveWords(List.of("internal only")).build())
                .build();
        var first = guarded.prompt().user("This doc is INTERNAL ONLY, right?").advisors(SessionAdvisors.session("g")).call().chatResponse();
        System.out.println("guard first: '" + first.getResult().getOutput().getText() + "' finish " + first.getResult().getMetadata().getFinishReason()
                + " stored " + sessions.getMessages("g").stream().map(m -> m.getMessageType() + ":" + m.getText()).toList());
        var second = guarded.prompt().user("And the weather?").advisors(SessionAdvisors.session("g")).call().chatResponse();
        System.out.println("guard on history: '" + second.getResult().getOutput().getText() + "' finish " + second.getResult().getMetadata().getFinishReason()
                + " stored " + sessions.getMessages("g").stream().map(m -> m.getMessageType() + ":" + m.getText()).toList());

        // Session memory at its default order, with a tool loop.
        var toolModel = model(p -> p.getInstructions().getLast() instanceof ToolResponseMessage ? new AssistantMessage("It shipped.")
                : AssistantMessage.builder().content("").toolCalls(List.of(new AssistantMessage.ToolCall("c1", "function", "lookup", "{\"orderNumber\":\"1042\"}"))).build());
        ChatClient.builder(toolModel).defaultAdvisors(SessionAdvisors.builder(sessions).build()).defaultTools(new Tools()).build()
                .prompt().user("Where is 1042?").advisors(SessionAdvisors.session("t")).call().content();
        System.out.println("default-order memory with a tool stored " + sessions.getMessages("t").stream().map(m -> m.getMessageType().toString()).toList());
        try {
            ChatClient.builder(plain).defaultAdvisors(SessionAdvisors.builder(sessions).build()).build().prompt().user("hi").call().content();
        } catch (Exception e) {
            System.out.println("no session id: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}
