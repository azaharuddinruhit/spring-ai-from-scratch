package com.example.support.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.support.SupportIntegrationTest;
import com.example.support.knowledge.KnowledgeSearchService.KnowledgeHit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;

@SupportIntegrationTest
class KnowledgeSearchIT {

    @Autowired
    KnowledgeIngestionService ingestion;

    @Autowired
    KnowledgeSearchService search;

    @BeforeEach
    void ingest() {
        ingestion.ingest(new ClassPathResource("knowledge/refunds.md"), "billing", Audience.CUSTOMER);
        ingestion.ingest(new ClassPathResource("knowledge/shipping.md"), "billing", Audience.CUSTOMER);
        ingestion.ingest(new ClassPathResource("knowledge/refund-exceptions.md"), "billing", Audience.STAFF);
    }

    @Test
    void findsTheRefundPolicyFirst() {
        assertThat(search.search("How long until my refund shows up?", "billing"))
                .extracting(KnowledgeHit::source)
                .first().isEqualTo("refunds.md");
    }

    @Test
    void neverReturnsStaffDocumentsToCustomers() {
        assertThat(search.search("Can I get a refund after 45 days?", "billing"))
                .extracting(KnowledgeHit::source)
                .isNotEmpty()
                .doesNotContain("refund-exceptions.md");
    }
}
