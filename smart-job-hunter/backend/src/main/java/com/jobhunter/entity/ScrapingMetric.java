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
@Table(name = "scraping_metrics")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ScrapingMetric {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "scrape_run_id")
    private UUID scrapeRunId;

    @Column(length = 50, nullable = false)
    private String platform;

    @Column(name = "metric_name", length = 100, nullable = false)
    private String metricName;

    @Column(name = "metric_value", nullable = false)
    private BigDecimal metricValue;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
