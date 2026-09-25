package com.jobhunter.repository;

import com.jobhunter.entity.SelectorFailure;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface SelectorFailureRepository extends JpaRepository<SelectorFailure, UUID> {
    List<SelectorFailure> findByResolvedFalseOrderByCreatedAtDesc();
    long countByResolvedFalse();
}
