package com.jobhunter.repository;

import com.jobhunter.entity.Job;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.UUID;

public interface JobRepository extends JpaRepository<Job, UUID> {

    long countByIsActiveTrue();

    Page<Job> findByIsActiveTrue(Pageable pageable);

    @Query("SELECT j FROM Job j WHERE j.isActive = true " +
           "AND (:platform IS NULL OR j.sourcePlatform = :platform) " +
           "AND (:location IS NULL OR LOWER(j.location) LIKE LOWER(CONCAT('%', :location, '%'))) " +
           "AND (:company IS NULL OR LOWER(j.companyName) LIKE LOWER(CONCAT('%', :company, '%')))")
    Page<Job> searchJobs(@Param("platform") String platform,
                         @Param("location") String location,
                         @Param("company") String company,
                         Pageable pageable);

    @Query("SELECT COUNT(DISTINCT j.companyName) FROM Job j WHERE j.isActive = true")
    long countDistinctCompanies();
}
