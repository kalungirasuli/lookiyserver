package com.celmeet.notification_service.helpers;


import lombok.Builder;
import lombok.Data;

import java.util.Date;

@Data
@Builder
public class NotificationReqDTO {

    private Integer userId;
    private String message;
    private String title;

}
