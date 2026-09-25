package com.jobhunter.controller;

import com.jobhunter.entity.JobApplication;
import com.jobhunter.repository.JobApplicationRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequestMapping("/applications")
@RequiredArgsConstructor
@Tag(name = "Applications", description = "Job application management APIs")
public class ApplicationController {

    private final JobApplicationRepository appRepo;

    @GetMapping
    @Operation(summary = "Get applications for a user")
    public Map<String, Object> getApplications(
            @RequestParam UUID userId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset) {

        Page<JobApplication> page;
        PageRequest pr = PageRequest.of(offset / Math.max(limit, 1), limit, Sort.by(Sort.Direction.DESC, "createdAt"));
        if (status != null && !status.isBlank()) {
            page = appRepo.findByUserIdAndStatus(userId, status, pr);
        } else {
            page = appRepo.findByUserId(userId, pr);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("applications", page.getContent());
        result.put("total", page.getTotalElements());
        result.put("hasMore", page.hasNext());
        return result;
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve an application")
    public ResponseEntity<JobApplication> approve(@PathVariable UUID id) {
        return appRepo.findById(id).map(app -> {
            app.setStatus("approved");
            app.setUpdatedAt(OffsetDateTime.now());
            return ResponseEntity.ok(appRepo.save(app));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/skip")
    @Operation(summary = "Skip an application")
    public ResponseEntity<JobApplication> skip(@PathVariable UUID id) {
        return appRepo.findById(id).map(app -> {
            app.setStatus("skipped");
            app.setUpdatedAt(OffsetDateTime.now());
            return ResponseEntity.ok(appRepo.save(app));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/apply")
    @Operation(summary = "Trigger application (placeholder)")
    public Map<String, Object> triggerApply(@RequestBody Map<String, UUID> body) {
        return Map.of("status", "queued", "message", "Application will be submitted via automation-service");
    }
}
