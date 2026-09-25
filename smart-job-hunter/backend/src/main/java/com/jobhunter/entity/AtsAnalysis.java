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
@Table(name = "ats_analysis")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AtsAnalysis {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    @Column(name = "ats_score", precision = 5, scale = 2)
    private BigDecimal atsScore;

    @Column(name = "keyword_match_pct", precision = 5, scale = 2)
    private BigDecimal keywordMatchPct;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "matched_keywords", columnDefinition = "jsonb")
    private JsonNode matchedKeywords;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "missing_keywords", columnDefinition = "jsonb")
    private JsonNode missingKeywords;

    @Column(nullable = false, length = 20)
    private String priority;

    @Column(name = "interview_probability", precision = 5, scale = 2)
    private BigDecimal interviewProbability;

    @Column(name = "skip_reason", columnDefinition = "text")
    private String skipReason;

    @Column(name = "analyzed_at")
    private OffsetDateTime analyzedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", insertable = false, updatable = false)
    private Job job;
}
