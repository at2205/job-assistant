package com.jobhunter.repository;

import com.jobhunter.entity.AtsAnalysis;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AtsAnalysisRepository extends JpaRepository<AtsAnalysis, UUID> {

    List<AtsAnalysis> findByUserId(UUID userId);

    Optional<AtsAnalysis> findByUserIdAndJobId(UUID userId, UUID jobId);

    long countByUserId(UUID userId);

    long countByUserIdAndPriority(UUID userId, String priority);

    @Query("SELECT AVG(a.atsScore) FROM AtsAnalysis a WHERE a.userId = :userId")
    BigDecimal avgAtsScore(@Param("userId") UUID userId);

    @Query("SELECT AVG(a.interviewProbability) FROM AtsAnalysis a WHERE a.userId = :userId")
    BigDecimal avgInterviewProbability(@Param("userId") UUID userId);

    @Query("SELECT a FROM AtsAnalysis a JOIN FETCH a.job WHERE a.userId = :userId " +
           "AND (:priority IS NULL OR a.priority = :priority) " +
           "ORDER BY a.atsScore DESC")
    Page<AtsAnalysis> findPrioritized(@Param("userId") UUID userId,
                                      @Param("priority") String priority,
                                      Pageable pageable);

    @Query("SELECT a FROM AtsAnalysis a JOIN FETCH a.job WHERE a.userId = :userId " +
           "AND a.atsScore >= :minScore ORDER BY a.atsScore DESC")
    Page<AtsAnalysis> findAboveThreshold(@Param("userId") UUID userId,
                                         @Param("minScore") BigDecimal minScore,
                                         Pageable pageable);

    @Query("SELECT COUNT(a) FROM AtsAnalysis a WHERE a.userId = :userId AND a.atsScore >= :minScore")
    long countAboveThreshold(@Param("userId") UUID userId, @Param("minScore") BigDecimal minScore);
}
