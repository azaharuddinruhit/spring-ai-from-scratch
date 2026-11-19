package com.example.support;

import com.example.support.refund.PaymentClient;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * The whole support app against real PostgreSQL and a real model. Every test class with the same annotations shares one
 * Spring context, so the containers start once per run.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("it")
@MockitoBean(types = PaymentClient.class) // a payment provider can't run in a container
public @interface SupportIntegrationTest {
}
