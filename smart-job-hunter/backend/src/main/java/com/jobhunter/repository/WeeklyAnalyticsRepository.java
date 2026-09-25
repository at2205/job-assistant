package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface WeeklyAnalyticsRepository extends JpaRepository<WeeklyAnalytics, UUID> {
    List<WeeklyAnalytics> findByUserIdOrderByWeekStartDesc(UUID userId);
}
