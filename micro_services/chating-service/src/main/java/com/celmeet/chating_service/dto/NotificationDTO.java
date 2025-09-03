package com.celmeet.chating_service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class NotificationDTO {

    private Integer id;
    private Integer userId;
    private String message;
    private boolean isRead;
    private Date creationDate;
    private String notificationType;
    private String title;

}
