package tsprobe;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.example.support.ScriptedChatModel;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.toolsearch.ToolSearchToolCallingAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.toolsearch.index.regex.RegexToolIndex;

public class ToolSearchProbe {
    static class Tools {
        @Tool(description = "Find a customer's order by its order number") public String findOrder(String orderNumber) { return "Order " + orderNumber + " has shipped"; }
        @Tool(description = "List the customer's invoices") public String listInvoices() { return "none"; }
        @Tool(description = "Reset the customer's password") public String resetPassword() { return "done"; }
        @Tool(description = "Change the customer's subscription plan") public String changePlan(String plan) { return "ok"; }
    }
    public static void main(String[] a) {
        List<String> seen = new ArrayList<>();
        int[] n = {0};
        ScriptedChatModel model = new ScriptedChatModel(prompt -> {
            var opts = (ToolCallingChatOptions) prompt.getOptions();
            seen.add(opts.getToolCallbacks().stream().map(c -> c.getToolDefinition().name()).sorted().toList().toString());
            if (n[0]++ == 0) {
                System.out.println("system: " + prompt.getSystemMessage().getText().replace("\n", " | ").substring(0, Math.min(400, prompt.getSystemMessage().getText().length())));
                return ScriptedChatModel.toolCall("toolSearchTool", "{\"query\":\"order\"}");
            }
            if (n[0] == 2) {
                System.out.println("search result: " + prompt.getInstructions().getLast());
                return ScriptedChatModel.toolCall("findOrder", "{\"orderNumber\":\"1042\"}");
            }
            return new AssistantMessage("Order 1042 has shipped.");
        });
        var advisor = ToolSearchToolCallingAdvisor.builder().toolIndex(new RegexToolIndex()).build();
        ChatClient client = ChatClient.builder(model).defaultAdvisors(advisor).defaultTools(new Tools()).defaultSystem("You are support.").build();
        String answer = client.prompt().user("Where is order 1042?").advisors(s -> s.param(ChatMemory.CONVERSATION_ID, "c1")).call().content();
        System.out.println("answer: " + answer);
        System.out.println("tools per call: " + seen);
        try {
            n[0] = 0; seen.clear();
            client.prompt().user("Where is order 1042?").call().content();
        } catch (Exception e) { System.out.println("no id: " + e); }
        System.exit(0);
    }
}
