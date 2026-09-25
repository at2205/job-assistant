package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "job_applications")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class JobApplication {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(length = 50)
    private String status;

    @Column(name = "applied_at")
    private OffsetDateTime appliedAt;

    @Column(name = "resume_used", columnDefinition = "text")
    private String resumeUsed;

    @Column(name = "cover_letter", columnDefinition = "text")
    private String coverLetter;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "platform_response", columnDefinition = "jsonb")
    private JsonNode platformResponse;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @Column(name = "recruiter_id")
    private UUID recruiterId;

    @Column(name = "last_stage", length = 30)
    private String lastStage;

    @Column(name = "response_received_at")
    private OffsetDateTime responseReceivedAt;

    @Column(name = "interview_count")
    private Integer interviewCount;

    @Column(name = "apply_hash", length = 64)
    private String applyHash;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", insertable = false, updatable = false)
    private Job job;
}
