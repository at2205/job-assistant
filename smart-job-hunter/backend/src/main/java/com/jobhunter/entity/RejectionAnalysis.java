package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "rejection_analysis")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RejectionAnalysis {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "application_id")
    private UUID applicationId;

    @Column(name = "rejection_stage", length = 50)
    private String rejectionStage;

    @Column(length = 100)
    private String reason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "missing_skills", columnDefinition = "jsonb")
    private JsonNode missingSkills;

    @Column(columnDefinition = "text")
    private String feedback;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "improvement_suggestions", columnDefinition = "jsonb")
    private JsonNode improvementSuggestions;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
