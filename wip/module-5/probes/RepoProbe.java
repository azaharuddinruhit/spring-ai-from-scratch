import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.example.support.order.*;
import com.example.support.refund.*;

public class RepoProbe {
    public static void main(String[] a) throws Exception {
        var ds = new DriverManagerDataSource("jdbc:postgresql://localhost:55432/postgres", "postgres", "probe");
        JdbcClient jdbc = JdbcClient.create(ds);
        jdbc.sql("DROP TABLE IF EXISTS refunds; DROP TABLE IF EXISTS orders").update();
        jdbc.sql("""
            CREATE TABLE orders (
                number          VARCHAR(20)    PRIMARY KEY,
                customer_id     VARCHAR(100)   NOT NULL,
                status          VARCHAR(20)    NOT NULL,
                total           NUMERIC(12, 2) NOT NULL,
                placed_on       DATE           NOT NULL,
                tracking_number VARCHAR(40)
            )""").update();
        jdbc.sql("""
            CREATE TABLE refunds (
                id           UUID           PRIMARY KEY,
                customer_id  VARCHAR(100)   NOT NULL,
                order_number VARCHAR(20)    NOT NULL REFERENCES orders (number),
                amount       NUMERIC(12, 2) NOT NULL,
                reason       VARCHAR(500)   NOT NULL,
                status       VARCHAR(20)    NOT NULL,
                expires_at   TIMESTAMPTZ    NOT NULL
            )""").update();
        jdbc.sql("INSERT INTO orders VALUES ('1042','alice','SHIPPED',59.90,'2026-11-02','1Z999AA10123456784'), ('1043','alice','PLACED',12.00,'2026-11-16',NULL), ('2077','bob','DELIVERED',1249.00,'2026-10-28',NULL)").update();
        var oc = OrderRepository.class.getDeclaredConstructor(JdbcClient.class); oc.setAccessible(true);
        OrderRepository orders = oc.newInstance(jdbc);
        System.out.println("find alice 1042: " + orders.findForCustomer("alice", "1042"));
        System.out.println("find alice 2077: " + orders.findForCustomer("alice", "2077"));
        System.out.println("recent alice 10: " + orders.findRecentForCustomer("alice", 10));
        var rc = RefundRepository.class.getDeclaredConstructor(JdbcClient.class); rc.setAccessible(true);
        RefundRepository refunds = rc.newInstance(jdbc);
        UUID id = UUID.randomUUID();
        try {
            refunds.insert(new Refund(id, "alice", "1042", new BigDecimal("59.90"), "Arrived broken", RefundStatus.PENDING, Instant.parse("2026-11-18T10:15:00Z")));
            System.out.println("insert ok");
        } catch (Exception e) { Throwable t = e; while (t.getCause() != null) t = t.getCause(); System.out.println("insert FAILED: " + t); }
        System.out.println("find: " + refunds.findForCustomer("alice", id));
        System.out.println("bob find: " + refunds.findForCustomer("bob", id));
        System.out.println("pending: " + refunds.findPendingForCustomer("alice"));
        System.out.println("confirm 1: " + refunds.markConfirmed(id));
        System.out.println("confirm 2: " + refunds.markConfirmed(id));
        System.out.println("after: " + refunds.findForCustomer("alice", id));
    }
}
