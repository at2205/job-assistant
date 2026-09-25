package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "interview_pipeline")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InterviewPipeline {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "application_id")
    private UUID applicationId;

    @Column(length = 30, nullable = false)
    private String stage;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(columnDefinition = "text")
    private String feedback;

    @Column(name = "next_step", columnDefinition = "text")
    private String nextStep;

    @Column(name = "scheduled_at")
    private OffsetDateTime scheduledAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", insertable = false, updatable = false)
    private Job job;
}
