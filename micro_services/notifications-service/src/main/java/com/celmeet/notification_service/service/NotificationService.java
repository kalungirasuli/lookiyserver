package com.celmeet.notification_service.service;


import com.celmeet.notification_service.dto.NotificationDTO;
import com.celmeet.notification_service.model.Notification;
import com.celmeet.notification_service.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.lang.module.ResolutionException;
import java.util.List;

@Service
public class NotificationService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private MapperService mapperService;


    public Page<Notification> getUserNotifications(Integer userId, int page, int size) {

        Sort sort = Sort.by(Sort.Direction.DESC, "creationDate");
        Pageable pageable = PageRequest.of(page, size, sort);

        return  notificationRepository.findAllByUserId(userId, pageable);
    }

    public void markAsRead(Integer id) {
        var notification = notificationRepository.findById(id).orElseThrow(
                ResolutionException::new
        );

        notification.setRead(true);
        notificationRepository.save(notification);

    }

    public List<NotificationDTO> getReadUserNotifications(Integer userId) {
        return notificationRepository.findAllByUserId(userId).stream().map(
                (notification)-> mapperService.notificationToNotificationDTO(notification)
        ).toList().stream().filter(
                NotificationDTO::isRead
        ).toList();
    }

    public List<NotificationDTO> getUnReadUserNotifications(Integer userId) {
        return notificationRepository.findAllByUserId(userId).stream().map(
                (notification)-> mapperService.notificationToNotificationDTO(notification)
        ).toList().stream().filter(
                (element)-> !element.isRead()
        ).toList();
    }

    public void deleteNotification(Integer id) {
        var notification = notificationRepository.findById(id).orElseThrow(
                ResolutionException::new
        );

        notificationRepository.delete(notification);
    }
}
