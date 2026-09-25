package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "interview_prep")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InterviewPrep {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "prep_type", length = 50)
    private String prepType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode questions;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "company_research", columnDefinition = "jsonb")
    private JsonNode companyResearch;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "talking_points", columnDefinition = "jsonb")
    private JsonNode talkingPoints;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
