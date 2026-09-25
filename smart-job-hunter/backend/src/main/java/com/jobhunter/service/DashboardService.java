package com.jobhunter.service;

import com.jobhunter.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final JobRepository jobRepo;
    private final AtsAnalysisRepository atsRepo;
    private final JobScoreRepository scoreRepo;
    private final JobApplicationRepository appRepo;
    private final ScrapeRunRepository scrapeRepo;
    private final InterviewPipelineRepository pipelineRepo;

    public Map<String, Object> getStats(UUID userId) {
        Map<String, Object> stats = new LinkedHashMap<>();

        long totalJobs = jobRepo.countByIsActiveTrue();
        long atsAnalyzed = atsRepo.countByUserId(userId);
        long highPriority = atsRepo.countByUserIdAndPriority(userId, "HIGH");
        long goodMatch = atsRepo.countByUserIdAndPriority(userId, "GOOD");
        long applications = appRepo.countByUserId(userId);
        long applied = appRepo.countByUserIdAndStatus(userId, "applied");
        BigDecimal avgAts = atsRepo.avgAtsScore(userId);
        BigDecimal avgInterview = atsRepo.avgInterviewProbability(userId);
        long aboveThreshold = atsRepo.countAboveThreshold(userId, BigDecimal.valueOf(60));

        stats.put("totalJobs", totalJobs);
        stats.put("aboveThreshold", aboveThreshold);
        stats.put("totalApplications", applications);
        stats.put("applied", applied);
        stats.put("successRate", applications > 0 ? Math.round((double) applied / applications * 100) : 0);

        // ATS stats
        Map<String, Object> ats = new LinkedHashMap<>();
        ats.put("analyzed", atsAnalyzed);
        ats.put("highPriority", highPriority);
        ats.put("goodMatch", goodMatch);
        ats.put("avgAtsScore", avgAts != null ? avgAts.doubleValue() : 0);
        ats.put("avgInterviewProbability", avgInterview != null ? avgInterview.doubleValue() : 0);
        ats.put("topMissing", List.of()); // populated from ATS analysis aggregation
        stats.put("ats", ats);

        // Score distribution
        Map<String, Long> dist = new LinkedHashMap<>();
        dist.put("90-100", atsRepo.countAboveThreshold(userId, BigDecimal.valueOf(90)));
        dist.put("75-89", atsRepo.countAboveThreshold(userId, BigDecimal.valueOf(75)) - dist.get("90-100"));
        dist.put("60-74", atsRepo.countAboveThreshold(userId, BigDecimal.valueOf(60)) - dist.get("90-100") - dist.get("75-89"));
        dist.put("below-60", atsAnalyzed - atsRepo.countAboveThreshold(userId, BigDecimal.valueOf(60)));
        stats.put("scoreDistribution", dist);

        // Pipeline counts
        Map<String, Long> pipeline = new LinkedHashMap<>();
        pipelineRepo.countByStage(userId).forEach(row ->
            pipeline.put((String) row[0], (Long) row[1])
        );
        stats.put("pipeline", pipeline);

        return stats;
    }
}
