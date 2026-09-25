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
@Tag(name = "Content & Follow-ups", description = "Generated content and follow-up APIs")
public class ContentController {

    private final GeneratedContentRepository contentRepo;
    private final FollowUpDraftRepository followUpRepo;

    @GetMapping("/content")
    @Operation(summary = "Get generated content for a job")
    public List<GeneratedContent> getContent(@RequestParam UUID userId, @RequestParam UUID jobId) {
        return contentRepo.findByUserIdAndJobId(userId, jobId);
    }

    @PostMapping("/content/generate")
    @Operation(summary = "Generate content (placeholder)")
    public Map<String, Object> generateContent(@RequestBody Map<String, Object> body) {
        return Map.of("status", "queued", "message", "Content generation triggered via AI provider");
    }

    @GetMapping("/follow-ups")
    @Operation(summary = "Get follow-up drafts")
    public List<FollowUpDraft> getFollowUps(
            @RequestParam UUID userId,
            @RequestParam(required = false) String status) {
        if (status != null && !status.isBlank()) {
            return followUpRepo.findByUserIdAndStatus(userId, status);
        }
        return followUpRepo.findByUserId(userId);
    }

    @PostMapping("/follow-ups/generate")
    @Operation(summary = "Generate follow-up (placeholder)")
    public Map<String, Object> generateFollowUp(@RequestBody Map<String, Object> body) {
        return Map.of("status", "queued", "message", "Follow-up generation triggered");
    }

    @PutMapping("/follow-ups/{id}/status")
    @Operation(summary = "Update follow-up status")
    public ResponseEntity<FollowUpDraft> updateFollowUpStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return followUpRepo.findById(id).map(f -> {
            f.setStatus(body.get("status"));
            return ResponseEntity.ok(followUpRepo.save(f));
        }).orElse(ResponseEntity.notFound().build());
    }
}
