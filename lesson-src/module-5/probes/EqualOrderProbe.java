import java.util.ArrayList;
import java.util.List;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.AdvisorChain;
import org.springframework.ai.chat.client.advisor.api.BaseAdvisor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

public class EqualOrderProbe {
    static final List<String> trace = new ArrayList<>();
    record Named(String name, int order) implements BaseAdvisor {
        Named(String name) { this(name, 0); }
        public ChatClientRequest before(ChatClientRequest r, AdvisorChain c) { trace.add(name); return r; }
        public ChatClientResponse after(ChatClientResponse r, AdvisorChain c) { return r; }
        public int getOrder() { return order; }
        public String getName() { return name; }
    }
    public static void main(String[] a) {
        ChatClient.builder(p -> new ChatResponse(List.of(new Generation(new AssistantMessage("ok")))))
                .defaultAdvisors(new Named("A"), new Named("B")).build()
                .prompt().user("hi").call().content();
        trace.add("|");
        ChatClient.builder(p -> new ChatResponse(List.of(new Generation(new AssistantMessage("ok"))))).defaultAdvisors(new Named("A")).defaultAdvisors(new Named("B")).build().prompt().user("hi").advisors(new Named("C")).advisors(new Named("D")).call().content();
        trace.add("| tool-calling model:");
        var model = new org.springframework.ai.chat.model.ChatModel() {
            public ChatResponse call(org.springframework.ai.chat.prompt.Prompt p) { return new ChatResponse(List.of(new Generation(new AssistantMessage("ok")))); }
            public org.springframework.ai.chat.prompt.ChatOptions getOptions() { return org.springframework.ai.model.tool.ToolCallingChatOptions.builder().build(); }
        };
        ChatClient.builder(model).defaultAdvisors(new Named("A"), new Named("B")).build().prompt().user("hi").call().content();
        trace.add("| before the loop (+50):");
        ChatClient.builder(model).defaultAdvisors(new Named("A", Integer.MIN_VALUE + 50), new Named("B", Integer.MIN_VALUE + 50)).build().prompt().user("hi").call().content();
        System.out.println(org.springframework.ai.chat.client.ChatClient.class.getProtectionDomain().getCodeSource().getLocation().getPath().replaceAll(".*/", "") + " ran " + trace);
    }
}
