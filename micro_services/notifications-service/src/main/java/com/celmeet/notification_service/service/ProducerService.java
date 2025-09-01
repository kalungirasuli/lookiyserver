package com.celmeet.notification_service.service;


import com.celmeet.notification_service.dto.NotificationDTO;
import com.celmeet.notification_service.enums.NotificationType;
import com.celmeet.notification_service.helpers.NotificationReqDTO;
import com.celmeet.notification_service.model.Notification;
import com.celmeet.notification_service.repository.NotificationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class ProducerService {

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private MapperService mapperService;

    private String topic = "snapearn";

    private KafkaTemplate<String, NotificationDTO> kafkaTemplate;

    public ProducerService(KafkaTemplate<String, NotificationDTO> kafkaTemplate){
        this.kafkaTemplate = kafkaTemplate;
    }


    public void sendNotification(NotificationReqDTO notificationReq, NotificationType notificationType){
        Notification notification = notificationRepository.save(
                Notification.builder()
                        .title(notificationReq.getTitle())
                        .userId(notificationReq.getUserId())
                        .message(notificationReq.getMessage())
                        .notificationType(notificationType)
                        .build()
        );

        log.info(":::::>>> Sending notification:  {} []", notification);
        kafkaTemplate.send(
                topic,
                notification.getUserId().toString(),
                mapperService.notificationToNotificationDTO(notification));
    }

}
