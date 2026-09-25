package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "scrape_runs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ScrapeRun {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(length = 50)
    private String platform;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "search_params", columnDefinition = "jsonb")
    private JsonNode searchParams;

    @Column(name = "jobs_found")
    private Integer jobsFound;

    @Column(name = "jobs_new")
    private Integer jobsNew;

    @Column(name = "jobs_updated")
    private Integer jobsUpdated;

    @Column(name = "jobs_skipped")
    private Integer jobsSkipped;

    @Column(length = 50)
    private String status;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;
}
