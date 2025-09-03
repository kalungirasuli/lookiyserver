package com.celmeet.notification_service.model;


import com.celmeet.notification_service.enums.NotificationType;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

@Entity
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class Notification {

    @GeneratedValue
    @Id
    private Integer id;
    private Integer userId;
    @Column(length = 5000)
    private String message;
    private boolean isRead = false;
    private Date creationDate;
    @Enumerated(EnumType.STRING)
    private NotificationType notificationType;
    private String title;

}
