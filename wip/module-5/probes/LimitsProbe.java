import java.util.*;
import org.springframework.ai.model.tool.*;
import org.springframework.ai.model.tool.autoconfigure.ToolCallingAutoConfiguration;
import org.springframework.ai.model.tool.autoconfigure.ToolCallingProperties;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Configuration;

public class LimitsProbe {
    @Configuration @ImportAutoConfiguration(ToolCallingAutoConfiguration.class) static class App {}
    public static void main(String[] a) {
        var ctx = new SpringApplicationBuilder(App.class).web(org.springframework.boot.WebApplicationType.NONE)
                .run("--spring.config.location=file:yaml/limits.yaml", "--logging.level.root=OFF", "--spring.main.banner-mode=off");
        var limits = ctx.getBean(ToolCallingProperties.class).getLimits();
        System.out.println("map=" + limits.getMaxCallsPerTool() + " default=" + limits.getMaxCallsPerToolDefault() + " total=" + limits.getMaxTotalToolCalls() + " on=" + limits.getOnLimitExceeded());
        ctx.close();
    }
}
