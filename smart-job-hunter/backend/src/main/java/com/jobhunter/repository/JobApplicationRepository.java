package com.jobhunter.repository;

import com.jobhunter.entity.JobApplication;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface JobApplicationRepository extends JpaRepository<JobApplication, UUID> {
    Page<JobApplication> findByUserId(UUID userId, Pageable pageable);
    Page<JobApplication> findByUserIdAndStatus(UUID userId, String status, Pageable pageable);
    long countByUserId(UUID userId);
    long countByUserIdAndStatus(UUID userId, String status);
}
