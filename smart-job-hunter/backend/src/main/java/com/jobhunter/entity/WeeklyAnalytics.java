package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "weekly_analytics")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class WeeklyAnalytics {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "week_start")
    private OffsetDateTime weekStart;

    @Column(name = "week_end")
    private OffsetDateTime weekEnd;

    @Column(name = "jobs_scraped")
    private Integer jobsScraped;

    @Column(name = "jobs_scored")
    private Integer jobsScored;

    @Column(name = "applications_sent")
    private Integer applicationsSent;

    @Column(name = "responses_received")
    private Integer responsesReceived;

    @Column(name = "interviews_scheduled")
    private Integer interviewsScheduled;

    @Column(name = "offers_received")
    private Integer offersReceived;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "score_distribution", columnDefinition = "jsonb")
    private JsonNode scoreDistribution;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "top_companies", columnDefinition = "jsonb")
    private JsonNode topCompanies;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "platform_breakdown", columnDefinition = "jsonb")
    private JsonNode platformBreakdown;

    @Column(name = "avg_ats_score")
    private Double avgAtsScore;

    @Column(name = "avg_interview_prob")
    private Double avgInterviewProb;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
