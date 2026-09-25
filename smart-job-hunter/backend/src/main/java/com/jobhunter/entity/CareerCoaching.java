package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "career_coaching")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CareerCoaching {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "coaching_type", length = 30, nullable = false)
    private String coachingType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode advice;

    @Column(name = "readiness_score")
    private Integer readinessScore;

    @Column(name = "provider_used", length = 30)
    private String providerUsed;

    @Column(name = "generated_at")
    private OffsetDateTime generatedAt;
}
