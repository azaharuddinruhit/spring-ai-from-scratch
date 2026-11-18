package com.example.support.knowledge;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.example.support.knowledge.KnowledgeSearchService.KnowledgeHit;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class KnowledgeSearchController {

    private final KnowledgeSearchService searchService;

    KnowledgeSearchController(KnowledgeSearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping("/api/knowledge/search")
    List<KnowledgeHit> search(@RequestParam @NotBlank @Size(max = 500) String q,
                              @RequestParam @NotBlank @Size(max = 50) String product) {
        return searchService.search(q, product);
    }
}
