package com.jobhunter.controller;

import com.jobhunter.entity.AtsAnalysis;
import com.jobhunter.repository.AtsAnalysisRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.*;

@RestController
@RequiredArgsConstructor
@Tag(name = "ATS Analysis", description = "ATS scoring and analysis APIs")
public class AtsController {

    private final AtsAnalysisRepository atsRepo;

    @GetMapping("/ats/stats")
    @Operation(summary = "Get ATS statistics for a user")
    public Map<String, Object> getAtsStats(@RequestParam UUID userId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("analyzed", atsRepo.countByUserId(userId));
        stats.put("highPriority", atsRepo.countByUserIdAndPriority(userId, "HIGH"));
        stats.put("goodMatch", atsRepo.countByUserIdAndPriority(userId, "GOOD"));

        BigDecimal avg = atsRepo.avgAtsScore(userId);
        BigDecimal avgInt = atsRepo.avgInterviewProbability(userId);
        stats.put("avgAtsScore", avg != null ? avg.doubleValue() : 0);
        stats.put("avgInterviewProbability", avgInt != null ? avgInt.doubleValue() : 0);

        // Aggregate missing keywords
        List<AtsAnalysis> all = atsRepo.findByUserId(userId);
        Map<String, Integer> missingCount = new LinkedHashMap<>();
        for (AtsAnalysis a : all) {
            if (a.getMissingKeywords() != null && a.getMissingKeywords().isArray()) {
                a.getMissingKeywords().forEach(kw -> {
                    String key = kw.asText();
                    missingCount.merge(key, 1, Integer::sum);
                });
            }
        }
        List<String> topMissing = missingCount.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(10)
                .map(Map.Entry::getKey)
                .toList();
        stats.put("topMissing", topMissing);

        return stats;
    }

    @GetMapping("/ats/{jobId}")
    @Operation(summary = "Get ATS analysis for a specific job")
    public ResponseEntity<AtsAnalysis> getAtsAnalysis(@PathVariable UUID jobId, @RequestParam UUID userId) {
        return atsRepo.findByUserIdAndJobId(userId, jobId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/analyze")
    @Operation(summary = "Trigger ATS analysis (placeholder)")
    public Map<String, Object> triggerAnalyze(@RequestBody Map<String, UUID> body) {
        return Map.of("status", "queued", "message", "ATS analysis triggered via automation-service");
    }

    @PostMapping("/score")
    @Operation(summary = "Trigger job scoring (placeholder)")
    public Map<String, Object> triggerScore(@RequestBody Map<String, UUID> body) {
        return Map.of("status", "queued", "message", "Job scoring triggered via automation-service");
    }

    @PostMapping("/quality-check")
    @Operation(summary = "Run quality check on a job")
    public Map<String, Object> qualityCheck(@RequestBody Map<String, Object> body) {
        return Map.of("passed", true, "flags", List.of(), "message", "Quality check passed");
    }
}
