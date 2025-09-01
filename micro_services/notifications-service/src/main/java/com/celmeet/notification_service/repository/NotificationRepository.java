package com.celmeet.notification_service.repository;


import com.celmeet.notification_service.model.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Integer> {

    public Page<Notification> findAllByUserId(Integer userId, Pageable pageable);

    public List<Notification> findAllByUserId(Integer userId);

}
