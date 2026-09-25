package com.jobhunter.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "jobs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Job {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "external_job_id", nullable = false)
    private String externalJobId;

    @Column(name = "source_platform", nullable = false, length = 50)
    private String sourcePlatform;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(name = "company_name", length = 500)
    private String companyName;

    @Column(length = 500)
    private String location;

    @Column(name = "experience_min")
    private Integer experienceMin;

    @Column(name = "experience_max")
    private Integer experienceMax;

    @Column(name = "salary_min")
    private Integer salaryMin;

    @Column(name = "salary_max")
    private Integer salaryMax;

    @Column(name = "salary_currency", length = 10)
    private String salaryCurrency;

    @Column(name = "job_description", columnDefinition = "text")
    private String jobDescription;

    @Column(name = "job_url", nullable = false, length = 2000)
    private String jobUrl;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private JsonNode skills;

    @Column(name = "company_rating", precision = 3, scale = 1)
    private BigDecimal companyRating;

    @Column(name = "job_type", length = 50)
    private String jobType;

    @Column(name = "posted_date")
    private LocalDate postedDate;

    @Column(name = "scraped_at")
    private OffsetDateTime scrapedAt;

    @Column(name = "last_seen_at")
    private OffsetDateTime lastSeenAt;

    @Column(name = "is_active")
    private Boolean isActive;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_data", columnDefinition = "jsonb")
    private JsonNode rawData;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quality_flags", columnDefinition = "jsonb")
    private JsonNode qualityFlags;

    @Column(name = "is_spam")
    private Boolean isSpam;
}
