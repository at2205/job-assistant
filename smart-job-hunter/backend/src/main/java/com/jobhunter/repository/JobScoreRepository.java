package com.jobhunter.repository;

import com.jobhunter.entity.JobScore;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface JobScoreRepository extends JpaRepository<JobScore, UUID> {
    Optional<JobScore> findByUserIdAndJobId(UUID userId, UUID jobId);

    @Query("SELECT s FROM JobScore s JOIN FETCH s.job WHERE s.userId = :userId " +
           "AND s.totalScore >= :minScore ORDER BY s.totalScore DESC")
    Page<JobScore> findRanked(@Param("userId") UUID userId,
                              @Param("minScore") BigDecimal minScore,
                              Pageable pageable);

    long countByUserId(UUID userId);

    @Query("SELECT AVG(s.totalScore) FROM JobScore s WHERE s.userId = :userId")
    BigDecimal avgTotalScore(@Param("userId") UUID userId);
}
