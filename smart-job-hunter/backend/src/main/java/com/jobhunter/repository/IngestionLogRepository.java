package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface IngestionLogRepository extends JpaRepository<IngestionLog, UUID> {
    List<IngestionLog> findTop100ByOrderByCreatedAtDesc();

    @Query("SELECT l.eventType, COUNT(l) FROM IngestionLog l WHERE l.platform = :platform GROUP BY l.eventType")
    List<Object[]> countByEventType(@Param("platform") String platform);
}
