package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "job_scores")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class JobScore {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "skill_score", precision = 5, scale = 2)
    private BigDecimal skillScore;

    @Column(name = "experience_score", precision = 5, scale = 2)
    private BigDecimal experienceScore;

    @Column(name = "location_score", precision = 5, scale = 2)
    private BigDecimal locationScore;

    @Column(name = "salary_score", precision = 5, scale = 2)
    private BigDecimal salaryScore;

    @Column(name = "recency_score", precision = 5, scale = 2)
    private BigDecimal recencyScore;

    @Column(name = "total_score", precision = 5, scale = 2)
    private BigDecimal totalScore;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "score_breakdown", columnDefinition = "jsonb")
    private JsonNode scoreBreakdown;

    @Column(name = "scoring_version", length = 20)
    private String scoringVersion;

    @Column(name = "scored_at")
    private OffsetDateTime scoredAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", insertable = false, updatable = false)
    private Job job;
}
