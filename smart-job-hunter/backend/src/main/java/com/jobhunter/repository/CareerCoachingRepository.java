package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface CareerCoachingRepository extends JpaRepository<CareerCoaching, UUID> {
    List<CareerCoaching> findByUserIdOrderByGeneratedAtDesc(UUID userId);
    List<CareerCoaching> findByUserIdAndCoachingTypeOrderByGeneratedAtDesc(UUID userId, String coachingType);
    CareerCoaching findFirstByUserIdOrderByGeneratedAtDesc(UUID userId);
}
