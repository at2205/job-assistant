package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface InterviewPrepRepository extends JpaRepository<InterviewPrep, UUID> {
    List<InterviewPrep> findByUserIdAndJobId(UUID userId, UUID jobId);
}
