package com.jobhunter.repository;

import com.jobhunter.entity.InterviewPipeline;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface InterviewPipelineRepository extends JpaRepository<InterviewPipeline, UUID> {
    List<InterviewPipeline> findByUserId(UUID userId);
    List<InterviewPipeline> findByUserIdAndStage(UUID userId, String stage);

    @Query("SELECT p.stage, COUNT(p) FROM InterviewPipeline p WHERE p.userId = :userId GROUP BY p.stage")
    List<Object[]> countByStage(@Param("userId") UUID userId);
}
