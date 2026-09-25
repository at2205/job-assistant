package com.jobhunter.controller;

import com.jobhunter.entity.*;
import com.jobhunter.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/ingestion")
@RequiredArgsConstructor
@Tag(name = "Ingestion & Observability", description = "Ingestion metrics and observability APIs")
public class IngestionController {

    private final ScrapeRunRepository scrapeRunRepo;
    private final IngestionLogRepository logRepo;
    private final ScrapingMetricRepository metricRepo;
    private final SelectorFailureRepository failureRepo;

    @GetMapping("/metrics")
    @Operation(summary = "Get ingestion metrics")
    public Map<String, Object> getMetrics() {
        Map<String, Object> metrics = new LinkedHashMap<>();

        List<ScrapeRun> runs = scrapeRunRepo.findTop20ByOrderByStartedAtDesc();
        metrics.put("recentRuns", runs);
        metrics.put("totalRuns", scrapeRunRepo.count());
        metrics.put("unresolvedFailures", failureRepo.countByResolvedFalse());

        // Event type counts
        Map<String, Long> eventCounts = new LinkedHashMap<>();
        logRepo.countByEventType("naukri").forEach(row ->
            eventCounts.put((String) row[0], (Long) row[1])
        );
        metrics.put("naukriEvents", eventCounts);

        return metrics;
    }

    @GetMapping("/logs")
    @Operation(summary = "Get recent ingestion logs")
    public List<IngestionLog> getLogs() {
        return logRepo.findTop100ByOrderByCreatedAtDesc();
    }

    @GetMapping("/failures")
    @Operation(summary = "Get unresolved selector failures")
    public List<SelectorFailure> getFailures() {
        return failureRepo.findByResolvedFalseOrderByCreatedAtDesc();
    }
}
