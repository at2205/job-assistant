package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RecruiterRepository extends JpaRepository<Recruiter, UUID> {
    List<Recruiter> findByUserId(UUID userId);
}
