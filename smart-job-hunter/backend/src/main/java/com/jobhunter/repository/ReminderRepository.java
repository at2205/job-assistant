package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ReminderRepository extends JpaRepository<Reminder, UUID> {
    List<Reminder> findByUserId(UUID userId);

    @Query("SELECT r FROM Reminder r WHERE r.userId = :userId AND r.status != 'completed' " +
           "AND r.dueAt <= :cutoff ORDER BY r.dueAt ASC")
    List<Reminder> findUpcoming(@Param("userId") UUID userId, @Param("cutoff") OffsetDateTime cutoff);
}
