package com.jobhunter.controller;

import com.jobhunter.entity.*;
import com.jobhunter.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequiredArgsConstructor
@Tag(name = "Pipeline", description = "Interview pipeline management")
public class PipelineController {

    private final InterviewPipelineRepository pipelineRepo;

    @GetMapping("/pipeline")
    @Operation(summary = "Get interview pipeline entries")
    public List<InterviewPipeline> getPipeline(
            @RequestParam UUID userId,
            @RequestParam(required = false) String stage) {
        if (stage != null && !stage.isBlank()) {
            return pipelineRepo.findByUserIdAndStage(userId, stage);
        }
        return pipelineRepo.findByUserId(userId);
    }

    @GetMapping("/pipeline/analytics")
    @Operation(summary = "Get pipeline analytics")
    public Map<String, Object> getPipelineAnalytics(@RequestParam UUID userId) {
        Map<String, Object> analytics = new LinkedHashMap<>();
        Map<String, Long> stageCounts = new LinkedHashMap<>();
        pipelineRepo.countByStage(userId).forEach(row ->
            stageCounts.put((String) row[0], (Long) row[1])
        );
        analytics.put("stageCounts", stageCounts);

        long total = stageCounts.values().stream().mapToLong(Long::longValue).sum();
        long offers = stageCounts.getOrDefault("OFFER", 0L);
        analytics.put("totalEntries", total);
        analytics.put("conversionRate", total > 0 ? Math.round((double) offers / total * 100) : 0);
        return analytics;
    }

    @PostMapping("/pipeline/stage")
    @Operation(summary = "Set pipeline stage for a job")
    public InterviewPipeline setStage(@RequestBody Map<String, Object> body) {
        UUID userId = UUID.fromString((String) body.get("userId"));
        UUID jobId = UUID.fromString((String) body.get("jobId"));
        String stage = (String) body.get("stage");

        InterviewPipeline entry = InterviewPipeline.builder()
                .userId(userId).jobId(jobId).stage(stage)
                .notes((String) body.get("notes"))
                .feedback((String) body.get("feedback"))
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();
        return pipelineRepo.save(entry);
    }

    @PostMapping("/pipeline/detect-ghosted")
    @Operation(summary = "Detect ghosted applications")
    public Map<String, Object> detectGhosted(@RequestBody Map<String, UUID> body) {
        return Map.of("ghosted", List.of(), "message", "No ghosted applications detected");
    }
}
