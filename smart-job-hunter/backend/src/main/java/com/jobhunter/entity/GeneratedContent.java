package com.jobhunter.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "generated_content")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GeneratedContent {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "content_type", length = 50)
    private String contentType;

    @Column(columnDefinition = "text")
    private String prompt;

    @Column(columnDefinition = "text")
    private String result;

    @Column(length = 50)
    private String provider;

    @Column(length = 100)
    private String model;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(name = "quality_score")
    private Integer qualityScore;

    @Column(length = 50)
    private String variant;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
