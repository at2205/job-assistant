package com.jobhunter.controller;

import com.jobhunter.entity.*;
import com.jobhunter.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequiredArgsConstructor
@Tag(name = "Prep & Intel", description = "Interview prep, company intel, and settings")
public class PrepController {

    private final InterviewPrepRepository prepRepo;
    private final CompanyIntelRepository companyRepo;
    private final UserRepository userRepo;

    @GetMapping("/prep/{jobId}")
    @Operation(summary = "Get interview prep for a job")
    public List<InterviewPrep> getPrep(@PathVariable UUID jobId, @RequestParam UUID userId) {
        return prepRepo.findByUserIdAndJobId(userId, jobId);
    }

    @PostMapping("/prep/generate")
    @Operation(summary = "Generate interview prep (placeholder)")
    public Map<String, Object> generatePrep(@RequestBody Map<String, Object> body) {
        return Map.of("status", "queued", "message", "Interview prep generation triggered");
    }

    @PostMapping("/prep/full")
    @Operation(summary = "Generate full interview prep (placeholder)")
    public Map<String, Object> generateFullPrep(@RequestBody Map<String, Object> body) {
        return Map.of("status", "queued", "message", "Full interview prep generation triggered");
    }

    @GetMapping("/companies")
    @Operation(summary = "Get company intelligence")
    public List<CompanyIntel> getCompanies(@RequestParam UUID userId) {
        return companyRepo.findByUserId(userId);
    }

    @PostMapping("/companies/refresh")
    @Operation(summary = "Refresh company intel (placeholder)")
    public Map<String, Object> refreshCompanyIntel(@RequestBody Map<String, UUID> body) {
        return Map.of("status", "queued", "message", "Company intelligence refresh triggered");
    }

    @GetMapping("/settings")
    @Operation(summary = "Get user settings")
    public Map<String, Object> getSettings(@RequestParam UUID userId) {
        return userRepo.findById(userId).map(u -> {
            Map<String, Object> settings = new LinkedHashMap<>();
            settings.put("userId", u.getId());
            settings.put("email", u.getEmail());
            settings.put("fullName", u.getFullName());
            settings.put("targetRoles", u.getTargetRoles());
            settings.put("targetLocations", u.getTargetLocations());
            settings.put("experienceYears", u.getExperienceYears());
            settings.put("expectedSalaryMin", u.getExpectedSalaryMin());
            settings.put("expectedSalaryMax", u.getExpectedSalaryMax());
            settings.put("skills", u.getSkills());
            settings.put("preferences", u.getPreferences());
            settings.put("plan", u.getPlan());
            return settings;
        }).orElse(Map.of());
    }

    @PutMapping("/settings")
    @Operation(summary = "Update user settings")
    public Map<String, Object> updateSettings(@RequestBody Map<String, Object> body) {
        UUID userId = UUID.fromString((String) body.get("userId"));
        return userRepo.findById(userId).map(u -> {
            if (body.containsKey("fullName")) u.setFullName((String) body.get("fullName"));
            if (body.containsKey("experienceYears")) u.setExperienceYears((Integer) body.get("experienceYears"));
            userRepo.save(u);
            return Map.<String, Object>of("status", "updated");
        }).orElse(Map.of("status", "user_not_found"));
    }
}
