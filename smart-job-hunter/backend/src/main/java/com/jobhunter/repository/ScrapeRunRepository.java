package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

// --- ScrapeRun ---
public interface ScrapeRunRepository extends JpaRepository<ScrapeRun, UUID> {
    List<ScrapeRun> findTop20ByOrderByStartedAtDesc();
    @Query("SELECT s FROM ScrapeRun s WHERE s.userId = :userId ORDER BY s.startedAt DESC")
    List<ScrapeRun> findRecentByUser(@Param("userId") UUID userId);
}
