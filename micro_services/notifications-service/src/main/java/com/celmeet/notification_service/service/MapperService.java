package com.celmeet.notification_service.service;

import com.celmeet.notification_service.dto.NotificationDTO;
import com.celmeet.notification_service.model.Notification;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MapperService {

    @Autowired
    EmojiConverter emojiConverter;

    public NotificationDTO notificationToNotificationDTO(Notification notification){
        return  NotificationDTO.builder()
                .id(notification.getId())
                .title(notification.getTitle())
                .creationDate(notification.getCreationDate())
                .notificationType(notification.getNotificationType())
                .isRead(notification.isRead())
                .message(emojiConverter.convertFromDatabase(notification.getMessage()))
                .userId(notification.getUserId())
                .build();
    }



}
