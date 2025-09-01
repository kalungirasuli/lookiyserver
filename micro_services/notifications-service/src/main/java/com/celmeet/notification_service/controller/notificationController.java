package com.celmeet.notification_service.controller;

import com.celmeet.notification_service.dto.CallNotificationReq;
import com.celmeet.notification_service.dto.NotificationDTO;
import com.celmeet.notification_service.enums.NotificationType;
import com.celmeet.notification_service.helpers.FCMReq;
import com.celmeet.notification_service.model.Notification;
import com.celmeet.notification_service.service.FCMService;
import com.celmeet.notification_service.service.MapperService;
import com.celmeet.notification_service.service.NotificationService;
import com.celmeet.notification_service.service.ProducerService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/notification/")
public class notificationController {


    @Autowired
    private ProducerService producerService;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private MapperService mapperService;

    @Autowired
    private FCMService fcmService;


    @GetMapping("/getAllUserNotifications/{id}")
    public ResponseEntity<Map<String, Object>> getAllUserNotifications(
            @PathVariable("id") Integer userId,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size,
            @RequestParam(name = "sort", defaultValue = "id") String sort,
            @RequestParam(name = "direction", defaultValue = "ASC") String direction
    ){

        Page<Notification> notificationPage;
        notificationPage = notificationService.getUserNotifications(userId, page, size);
        Map<String , Object> response = new HashMap<>();
        response.put("notifications", notificationPage.getContent().stream().map(
                (notification)-> mapperService.notificationToNotificationDTO(notification)
        ).toList());
        response.put("currentPage", notificationPage.getNumber());
        response.put("totalItems", notificationPage.getTotalElements());
        response.put("totalPages", notificationPage.getTotalPages());
        response.put("pageSize", notificationPage.getSize());
        response.put("hasNext", notificationPage.hasNext());
        response.put("hasPrevious", notificationPage.hasPrevious());


        return ResponseEntity.ok(response);
    }


    @GetMapping("/getAllReadUserNotifications/{id}")
    public ResponseEntity<List<NotificationDTO>> getAllReadUserNotifications(
            @PathVariable("id") Integer userId
    ){
        return ResponseEntity.ok(notificationService.getReadUserNotifications(userId));
    }

    @GetMapping("/getAllUnReadUserNotifications/{id}")
    public ResponseEntity<List<NotificationDTO>> getAllUnReadUserNotifications(
            @PathVariable("id") Integer userId
    ){
        return ResponseEntity.ok(notificationService.getUnReadUserNotifications(userId));
    }


    @PutMapping("/markAsRead/{id}")
    public  ResponseEntity<Void> markAsRead(
            @PathVariable("id") Integer id
    ){
        notificationService.markAsRead(id);
        return  ResponseEntity.ok().build();
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> deleteNotification(
            @PathVariable("id") Integer id
    ){
        notificationService.deleteNotification(id);
        return  ResponseEntity.ok().build();
    }


    @PostMapping("pushNotification/{token}")
    public ResponseEntity<Void> sendSingleNotification(
            @RequestBody FCMReq req,
            @PathVariable("token") String token
            ){
        try {
            fcmService.sendSinglePush(req, token);
            return ResponseEntity.ok().build();
        }catch (Exception e){
            log.info("::::>> Exception sending push notification:    {} []",e,e);
            return ResponseEntity.status(500).build();
        }
    }

    @PostMapping("sendNotificationToTopic/{topic}")
    public ResponseEntity<Void> pushBroadCast(
            @RequestBody FCMReq req,
            @PathVariable("topic") String topic
    ){
        try {
            fcmService.sendMessageToTopic(req, topic);
            return ResponseEntity.ok().build();
        }catch (Exception e){
            log.info("::::>> Exception sending push notification to Topic:    {} []",e,e);
            return ResponseEntity.status(500).build();
        }
    }

    @PostMapping("sendCallNotification")
    public ResponseEntity<Void> sendCallNotification(
            @RequestBody CallNotificationReq callNotificationReq
    ){
      fcmService.sendCallNotification(callNotificationReq);
      return ResponseEntity.ok().build();
    }


    public NotificationType getNotificationType(String type){
        return switch (type) {
            case "advert" -> NotificationType.ADVERT;
            case "task" -> NotificationType.TASK;
            case "competition" -> NotificationType.COMPETITION;
            case "transaction" -> NotificationType.TRANSACTION;
            case "auth" -> NotificationType.AUTH;
            default -> NotificationType.USER;
        };
    }


}
