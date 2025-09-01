package com.celmeet.notification_service.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CallNotificationReq {

    private Integer userId; //the id of the user that is being called
    private Integer callerId; //this is the id of the caller
    private String username; // the name of the user that is being called
    private String callerName; // the name of the user that is calling

}
