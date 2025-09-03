package com.celmeet.chating_service.services;



import com.celmeet.chating_service.dto.NotificationDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.Date;

@Service
public class ProducerService {

    @Autowired
    private KafkaTemplate<String, NotificationDTO> kafkaTemplate;

    private  String topic = "celmeet";


    public ProducerService(KafkaTemplate<String, NotificationDTO> kafkaTemplate){
        this.kafkaTemplate = kafkaTemplate;
    }

    public void sendNotification(String title, Integer userId, String message){
        var notification = NotificationDTO.builder()
                .title(title)
                .message(message)
                .notificationType("CHAT")
                .userId(userId)
                .creationDate(new Date())
                .id(0)
                .build();
        kafkaTemplate.send(
                topic,
                notification.getUserId().toString(),
                notification);
    }


}
