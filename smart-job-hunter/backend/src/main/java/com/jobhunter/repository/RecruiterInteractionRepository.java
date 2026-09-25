package com.jobhunter.repository;

import com.jobhunter.entity.RecruiterInteraction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RecruiterInteractionRepository extends JpaRepository<RecruiterInteraction, UUID> {
    List<RecruiterInteraction> findByRecruiterId(UUID recruiterId);
}
