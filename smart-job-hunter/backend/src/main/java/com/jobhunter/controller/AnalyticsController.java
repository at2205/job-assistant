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
@Tag(name = "Analytics & Reports", description = "Analytics, rejections, reminders, coaching, reports")
public class AnalyticsController {

    private final WeeklyAnalyticsRepository weeklyRepo;
    private final RejectionAnalysisRepository rejectionRepo;
    private final ReminderRepository reminderRepo;
    private final CareerCoachingRepository coachRepo;
    private final AtsAnalysisRepository atsRepo;
    private final JobApplicationRepository appRepo;
    private final JobRepository jobRepo;

    @GetMapping("/analytics")
    @Operation(summary = "Get analytics summary")
    public Map<String, Object> getAnalytics(@RequestParam UUID userId) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("totalApplications", appRepo.countByUserId(userId));
        a.put("totalJobs", jobRepo.countByIsActiveTrue());
        a.put("applied", appRepo.countByUserIdAndStatus(userId, "applied"));
        a.put("interviews", appRepo.countByUserIdAndStatus(userId, "interview"));
        a.put("offers", appRepo.countByUserIdAndStatus(userId, "offer"));
        var avg = atsRepo.avgAtsScore(userId);
        a.put("avgAtsScore", avg != null ? avg.doubleValue() : 0);
        return a;
    }

    @GetMapping("/rejections")
    @Operation(summary = "Get rejection analyses")
    public List<RejectionAnalysis> getRejections(@RequestParam UUID userId) {
        return rejectionRepo.findByUserId(userId);
    }

    @GetMapping("/rejections/patterns")
    @Operation(summary = "Get rejection patterns")
    public List<Map<String, Object>> getRejectionPatterns(@RequestParam UUID userId) {
        return rejectionRepo.findPatterns(userId).stream().map(row -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("reason", row[0]);
            m.put("count", row[1]);
            return m;
        }).toList();
    }

    @PostMapping("/rejections/analyze")
    @Operation(summary = "Analyze rejection (placeholder)")
    public Map<String, Object> analyzeRejection(@RequestBody Map<String, UUID> body) {
        return Map.of("status", "queued", "message", "Rejection analysis triggered");
    }

    @GetMapping("/reminders")
    @Operation(summary = "Get reminders")
    public List<Reminder> getReminders(@RequestParam UUID userId) {
        return reminderRepo.findByUserId(userId);
    }

    @GetMapping("/reminders/upcoming")
    @Operation(summary = "Get upcoming reminders")
    public List<Reminder> getUpcomingReminders(@RequestParam UUID userId) {
        return reminderRepo.findUpcoming(userId, OffsetDateTime.now().plusDays(7));
    }

    @PostMapping("/reminders")
    @Operation(summary = "Create a reminder")
    public Reminder createReminder(@RequestBody Map<String, Object> body) {
        Reminder r = Reminder.builder()
                .userId(UUID.fromString((String) body.get("userId")))
                .title((String) body.get("title"))
                .description((String) body.get("description"))
                .reminderType((String) body.get("type"))
                .status("pending")
                .dueAt(body.containsKey("dueAt") ? OffsetDateTime.parse((String) body.get("dueAt")) : null)
                .createdAt(OffsetDateTime.now())
                .build();
        return reminderRepo.save(r);
    }

    @PostMapping("/reminders/{id}/complete")
    @Operation(summary = "Complete a reminder")
    public ResponseEntity<Reminder> completeReminder(@PathVariable UUID id) {
        return reminderRepo.findById(id).map(r -> {
            r.setStatus("completed");
            r.setCompletedAt(OffsetDateTime.now());
            return ResponseEntity.ok(reminderRepo.save(r));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/reports/weekly")
    @Operation(summary = "Get weekly reports")
    public List<WeeklyAnalytics> getWeeklyReports(@RequestParam UUID userId) {
        return weeklyRepo.findByUserIdOrderByWeekStartDesc(userId);
    }

    @PostMapping("/reports/weekly/generate")
    @Operation(summary = "Generate weekly report (placeholder)")
    public Map<String, Object> generateWeeklyReport(@RequestBody Map<String, UUID> body) {
        return Map.of("status", "queued", "message", "Weekly report generation triggered");
    }

    @GetMapping("/coach/readiness")
    @Operation(summary = "Get career readiness score")
    public Map<String, Object> getReadinessScore(@RequestParam UUID userId) {
        CareerCoaching latest = coachRepo.findFirstByUserIdOrderByGeneratedAtDesc(userId);
        if (latest != null) {
            return Map.of("readinessScore", latest.getReadinessScore() != null ? latest.getReadinessScore() : 0,
                    "advice", latest.getAdvice() != null ? latest.getAdvice() : "");
        }
        return Map.of("readinessScore", 0, "advice", "No coaching data available yet");
    }

    @GetMapping("/coach/history")
    @Operation(summary = "Get coaching history")
    public List<CareerCoaching> getCoachHistory(
            @RequestParam UUID userId,
            @RequestParam(required = false) String type) {
        if (type != null && !type.isBlank()) {
            return coachRepo.findByUserIdAndCoachingTypeOrderByGeneratedAtDesc(userId, type);
        }
        return coachRepo.findByUserIdOrderByGeneratedAtDesc(userId);
    }

    @PostMapping("/coach/advice")
    @Operation(summary = "Get coaching advice (placeholder)")
    public Map<String, Object> getCoachAdvice(@RequestBody Map<String, Object> body) {
        return Map.of("status", "queued", "message", "Coaching advice generation triggered");
    }
}
