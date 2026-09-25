package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "company_intel")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CompanyIntel {
    @Id @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "company_name", length = 300)
    private String companyName;

    @Column(length = 100)
    private String industry;

    @Column(name = "employee_count", length = 50)
    private String employeeCount;

    @Column(name = "glassdoor_rating")
    private Double glassdoorRating;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tech_stack", columnDefinition = "jsonb")
    private JsonNode techStack;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "culture_notes", columnDefinition = "jsonb")
    private JsonNode cultureNotes;

    @Column(name = "hiring_velocity", length = 50)
    private String hiringVelocity;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
