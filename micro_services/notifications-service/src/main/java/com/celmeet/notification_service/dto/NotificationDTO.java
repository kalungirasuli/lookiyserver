package com.celmeet.notification_service.dto;

import com.celmeet.notification_service.enums.NotificationType;
import lombok.*;

import java.util.Date;

@Data
@Builder
@ToString
@AllArgsConstructor
@NoArgsConstructor
public class NotificationDTO {

    private Integer id;
    private Integer userId;
    private String message;
    private boolean isRead;
    private Date creationDate;
    private NotificationType notificationType;
    private String title;

}
