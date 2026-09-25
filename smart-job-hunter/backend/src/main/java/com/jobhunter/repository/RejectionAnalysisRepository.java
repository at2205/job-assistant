package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface RejectionAnalysisRepository extends JpaRepository<RejectionAnalysis, UUID> {
    List<RejectionAnalysis> findByUserId(UUID userId);

    @Query("SELECT r.reason, COUNT(r) FROM RejectionAnalysis r WHERE r.userId = :userId GROUP BY r.reason ORDER BY COUNT(r) DESC")
    List<Object[]> findPatterns(@Param("userId") UUID userId);
}
