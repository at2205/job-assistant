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
@Table(name = "ingestion_logs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class IngestionLog {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "scrape_run_id")
    private UUID scrapeRunId;

    @Column(length = 50, nullable = false)
    private String platform;

    @Column(name = "event_type", length = 50, nullable = false)
    private String eventType;

    @Column(columnDefinition = "text")
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode metadata;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;
}
