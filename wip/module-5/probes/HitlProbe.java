import java.util.*;
import org.springframework.ai.chat.client.AdvisorParams;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.*;
import org.springframework.ai.tool.annotation.Tool;

public class HitlProbe {
    static class Tools {
        final List<String> log = new ArrayList<>();
        @Tool(description = "Refund an order") String refund(String orderNumber) { log.add("refund " + orderNumber); return "Refunded " + orderNumber; }
        @Tool(description = "Find an order") String findOrder(String orderNumber) { log.add("find " + orderNumber); return "SHIPPED"; }
    }
    public static void main(String[] a) {
        var tools = new Tools();
        var model = new ToolProbe.ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("Done.") : ToolProbe.calls("refund", "{\"orderNumber\":\"1042\"}"));
        var memory = MessageWindowChatMemory.builder().build();
        ToolExecutionEligibilityChecker needsNoApproval = r -> r.hasToolCalls() && r.getResults().stream()
                .flatMap(g -> g.getOutput().getToolCalls().stream()).noneMatch(c -> c.name().equals("refund"));
        var client = ChatClient.builder(model)
                .defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build(),
                        ToolCallingAdvisor.builder().toolExecutionEligibilityChecker(needsNoApproval).build())
                .defaultTools(tools).build();
        ChatResponse r = client.prompt().user("Refund 1042").advisors(s -> s.param(ChatMemory.CONVERSATION_ID, "c1")).call().chatResponse();
        System.out.println("=== eligibility checker");
        System.out.println("hasToolCalls=" + r.hasToolCalls() + " calls=" + r.getResult().getOutput().getToolCalls() + " text='" + r.getResult().getOutput().getText() + "' finish=" + r.getResult().getMetadata().getFinishReason());
        System.out.println("tool log=" + tools.log + " model calls=" + model.seen.size());
        System.out.println("memory=" + memory.get("c1").stream().map(ToolProbe::describe).toList());

        // Approve: run the pending call ourselves.
        var manager = DefaultToolCallingManager.builder().build();
        Prompt last = model.seen.getLast();
        ToolExecutionResult result = manager.executeToolCalls(last, r);
        System.out.println("after approval history=" + result.conversationHistory().stream().map(ToolProbe::describe).toList() + " log=" + tools.log);

        System.out.println("=== auto-register off");
        var model2 = new ToolProbe.ScriptedModel(p -> ToolProbe.calls("findOrder", "{\"orderNumber\":\"7\"}"));
        var tools2 = new Tools();
        ChatResponse r2 = ChatClient.builder(model2).defaultTools(tools2).defaultAdvisors(AdvisorParams.toolCallingAdvisorAutoRegister(false)).build()
                .prompt().user("x").call().chatResponse();
        System.out.println("hasToolCalls=" + r2.hasToolCalls() + " log=" + tools2.log + " model calls=" + model2.seen.size());
    }
}
