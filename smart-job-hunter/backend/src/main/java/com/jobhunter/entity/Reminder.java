package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "reminders")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Reminder {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id")
    private UUID jobId;

    @Column(name = "reminder_type", length = 50)
    private String reminderType;

    @Column(length = 200)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "due_at")
    private OffsetDateTime dueAt;

    @Column(length = 30)
    private String status;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
