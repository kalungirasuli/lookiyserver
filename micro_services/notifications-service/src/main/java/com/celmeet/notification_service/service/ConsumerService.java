package com.celmeet.notification_service.service;

import com.celmeet.notification_service.dto.NotificationDTO;
import com.celmeet.notification_service.enums.NotificationType;
import com.celmeet.notification_service.helpers.FCMReq;
import com.celmeet.notification_service.model.Notification;
import com.celmeet.notification_service.repository.NotificationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;



@Slf4j
@Service
public class ConsumerService {

    @Autowired
    private  MapperService mapperService;

    @Autowired
    private FCMService fcmService;

    @Autowired
    private EmojiConverter emojiConverter;

    @Autowired
    private NotificationRepository notificationRepository;


    private final SimpMessagingTemplate messagingTemplate;

    public ConsumerService(SimpMessagingTemplate messagingTemplate){
        this.messagingTemplate = messagingTemplate;

    }


    @KafkaListener(topics = {"celmeet"}, groupId = "celmeet_v1")
    public void consumeUserNotification(NotificationDTO notification){
        log.info(":::::::>>>>> Received notification:  {} []", notification);

        var _notification = Notification.builder()
                .title(notification.getTitle())
                .userId(notification.getUserId())
                .message(notification.getMessage())
                .creationDate(notification.getCreationDate())
                .notificationType(notification.getNotificationType())
                .build();

        if(notification.getNotificationType()!= NotificationType.CHAT){
            Notification savedNotification = notificationRepository.save(
                    _notification
            );
        }

        messagingTemplate.convertAndSend(
                "/queue/notifications",
                mapperService.notificationToNotificationDTO(_notification)
        );
        log.info(":::::::>>>>> Done sending notification{Changed}:  {} []", notification.getUserId());

        try{
            if(_notification.getNotificationType() == NotificationType.CHAT
                    || _notification.getNotificationType() == NotificationType.TRANSACTION){
                fcmService.sendMessageToTopic(FCMReq.builder()
                        .message(emojiConverter.convertFromDatabase(_notification.getMessage()))
                        .title(_notification.getTitle())
                        .build(), _notification.getUserId().toString());

                log.info("::::::::>>> Successfully sent the notification{FCM}::  {}", _notification);
            }
        }catch (Exception e){
            log.info(":::::::::::>>> Exception sending user push notifications:::   {}",e,e);
        }

    }

//    @KafkaListener(topics = "snapearn", groupId = "snapearn_v1") //todo set this to handle only notifications sent as broadcast
//    public void consumeBroadCast(NotificationDTO notification){
//        messagingTemplate.convertAndSend(
//                "",
//                notification
//        );
//    }



}
