package com.jobhunter.controller;

import com.jobhunter.entity.*;
import com.jobhunter.repository.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.*;

@RestController
@RequestMapping("/jobs")
@RequiredArgsConstructor
@Tag(name = "Jobs", description = "Job listing, ranking, and search APIs")
public class JobController {

    private final JobRepository jobRepo;
    private final JobScoreRepository scoreRepo;
    private final AtsAnalysisRepository atsRepo;

    @GetMapping("/ranked")
    @Operation(summary = "Get ATS-ranked jobs for a user")
    public Map<String, Object> getRankedJobs(
            @RequestParam UUID userId,
            @RequestParam(defaultValue = "0") int minScore,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "atsScore") String sortBy) {

        Page<AtsAnalysis> page = atsRepo.findAboveThreshold(
                userId, BigDecimal.valueOf(minScore),
                PageRequest.of(offset / Math.max(limit, 1), limit));

        List<Map<String, Object>> jobs = page.getContent().stream().map(a -> {
            Job j = a.getJob();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", j.getId());
            m.put("title", j.getTitle());
            m.put("company", j.getCompanyName());
            m.put("location", j.getLocation());
            m.put("experienceMin", j.getExperienceMin());
            m.put("experienceMax", j.getExperienceMax());
            m.put("salaryMin", j.getSalaryMin());
            m.put("salaryMax", j.getSalaryMax());
            m.put("skills", j.getSkills());
            m.put("jobUrl", j.getJobUrl());
            m.put("sourcePlatform", j.getSourcePlatform());
            m.put("postedDate", j.getPostedDate());
            m.put("scrapedAt", j.getScrapedAt());

            Map<String, Object> score = new LinkedHashMap<>();
            score.put("totalScore", a.getAtsScore());
            score.put("skillScore", a.getKeywordMatchPct());
            score.put("interviewProbability", a.getInterviewProbability());
            score.put("priority", a.getPriority());
            score.put("matchedKeywords", a.getMatchedKeywords());
            score.put("missingKeywords", a.getMissingKeywords());
            m.put("score", score);

            String tier = a.getAtsScore().compareTo(BigDecimal.valueOf(80)) >= 0 ? "excellent"
                    : a.getAtsScore().compareTo(BigDecimal.valueOf(60)) >= 0 ? "good"
                    : a.getAtsScore().compareTo(BigDecimal.valueOf(40)) >= 0 ? "fair" : "poor";
            m.put("tier", tier);
            m.put("autoApplyEligible", a.getAtsScore().compareTo(BigDecimal.valueOf(80)) >= 0);
            return m;
        }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("jobs", jobs);
        result.put("total", page.getTotalElements());
        result.put("hasMore", page.hasNext());
        return result;
    }

    @GetMapping("/{jobId}")
    @Operation(summary = "Get job detail")
    public ResponseEntity<Job> getJobDetail(@PathVariable UUID jobId) {
        return jobRepo.findById(jobId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{jobId}/score")
    @Operation(summary = "Get job score for a user")
    public ResponseEntity<Map<String, Object>> getJobScore(@PathVariable UUID jobId, @RequestParam UUID userId) {
        return scoreRepo.findByUserIdAndJobId(userId, jobId)
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("totalScore", s.getTotalScore());
                    m.put("skillScore", s.getSkillScore());
                    m.put("experienceScore", s.getExperienceScore());
                    m.put("locationScore", s.getLocationScore());
                    m.put("salaryScore", s.getSalaryScore());
                    m.put("recencyScore", s.getRecencyScore());
                    m.put("scoreBreakdown", s.getScoreBreakdown());
                    return ResponseEntity.ok(m);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    @Operation(summary = "Search jobs with filters")
    public Map<String, Object> searchJobs(
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String location,
            @RequestParam(required = false) String company,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset) {

        Page<Job> page = jobRepo.searchJobs(platform, location, company,
                PageRequest.of(offset / Math.max(limit, 1), limit, Sort.by(Sort.Direction.DESC, "scrapedAt")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("jobs", page.getContent());
        result.put("total", page.getTotalElements());
        result.put("hasMore", page.hasNext());
        return result;
    }

    @GetMapping("/prioritized")
    @Operation(summary = "Get prioritized jobs by ATS analysis")
    public Map<String, Object> getPrioritizedJobs(
            @RequestParam UUID userId,
            @RequestParam(required = false) String priority,
            @RequestParam(defaultValue = "20") int limit) {

        Page<AtsAnalysis> page = atsRepo.findPrioritized(userId, priority,
                PageRequest.of(0, limit));

        List<Map<String, Object>> jobs = page.getContent().stream().map(a -> {
            Job j = a.getJob();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", j.getId());
            m.put("title", j.getTitle());
            m.put("company", j.getCompanyName());
            m.put("location", j.getLocation());
            m.put("skills", j.getSkills());
            m.put("jobUrl", j.getJobUrl());
            m.put("atsScore", a.getAtsScore());
            m.put("keywordMatchPct", a.getKeywordMatchPct());
            m.put("matchedKeywords", a.getMatchedKeywords());
            m.put("missingKeywords", a.getMissingKeywords());
            m.put("priority", a.getPriority());
            m.put("interviewProbability", a.getInterviewProbability());
            return m;
        }).toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("jobs", jobs);
        result.put("total", page.getTotalElements());
        return result;
    }
}
