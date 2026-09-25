package com.jobhunter.repository;

import com.jobhunter.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface CompanyIntelRepository extends JpaRepository<CompanyIntel, UUID> {
    List<CompanyIntel> findByUserId(UUID userId);
}
