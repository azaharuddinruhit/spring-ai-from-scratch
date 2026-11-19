package com.example.support.knowledge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.mockito.BDDMockito.given;

import java.util.List;

import com.example.support.knowledge.KnowledgeSearchService.KnowledgeHit;

import com.example.support.security.SecurityConfig;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@WebMvcTest(KnowledgeSearchController.class)
@Import(SecurityConfig.class)
class KnowledgeSearchControllerTest {

    @Autowired
    private MockMvcTester mvc;

    @MockitoBean
    private KnowledgeSearchService searchService;

    @Test
    void returnsTheHits() {
        given(searchService.search("refund time", "billing"))
                .willReturn(List.of(new KnowledgeHit("billing-handbook.pdf", 4, 0.82, "Refunds take 5 business days.")));

        assertThat(mvc.get().uri("/api/knowledge/search?q={q}&product={p}", "refund time", "billing").with(jwt()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        [
                          {
                            "source": "billing-handbook.pdf",
                            "page": 4,
                            "score": 0.82,
                            "text": "Refunds take 5 business days."
                          }
                        ]
                        """);
    }

    @Test
    void rejectsABlankQuery() {
        assertThat(mvc.get().uri("/api/knowledge/search?q= &product=billing").with(jwt())).hasStatus(HttpStatus.BAD_REQUEST);
    }
}
