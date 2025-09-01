package com.celmeet.notification_service.controller;


import com.celmeet.notification_service.dto.NotificationDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

@Slf4j
@Controller
public class WebSocketController {

    @MessageMapping("/send.notification")
    @SendToUser("/queue/notifications")
    public NotificationDTO sendSpecificUserNotification(NotificationDTO notification) {
        // Process and return the notification
//        log.info("::::::::>>>>>>  got a send request: {} []", notification);
        return notification;
    }

    @MessageMapping("/send.broadcast")
    @SendTo("/topic/broadcast")
    public NotificationDTO broadcastNotification(NotificationDTO notification) {
        // Process and return the broadcast notification
        return notification;
    }

}
