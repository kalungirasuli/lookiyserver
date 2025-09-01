package com.celmeet.notification_service.service;


import com.celmeet.notification_service.dto.CallNotificationReq;
import com.celmeet.notification_service.helpers.FCMReq;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.Notification;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class FCMService {


    public void sendSinglePush(FCMReq req, String token) throws FirebaseMessagingException {
        Message message = Message.builder()
                .putData("type", "Single notification")
                .setToken(token)
                .putData("content", req.getMessage())
                .setNotification(Notification.builder()
                        .setTitle(req.getTitle())
                        .setBody(req.getMessage())
                        .build())
                .build();

        var response = FirebaseMessaging.getInstance().send(message);
        log.info("Sending message successful:   {} []", response);
    }

    public void sendMessageToTopic(FCMReq req, String topic) throws FirebaseMessagingException {
        Message message = Message.builder()
                .putData("type", "Topic notification")
                .putData("content", req.getMessage())
                .setTopic(topic)
                .setNotification(Notification.builder()
                        .setTitle(req.getTitle())
                        .setBody(req.getMessage())
                        .build())
                .build();

        var response = FirebaseMessaging.getInstance().send(message);
        log.info("Sending message to topic successful:   {} []", response);
    }

    public void sendCallNotification(CallNotificationReq callNotificationReq) {
        try{
            Map<String, String> notificationData = new HashMap<>();
            notificationData.put("userId", String.valueOf(callNotificationReq.getUserId()));
            notificationData.put("callerId", String.valueOf(callNotificationReq.getCallerId()));
            notificationData.put("username", callNotificationReq.getUsername());
            notificationData.put("callerName", callNotificationReq.getCallerName());
            notificationData.put("type", "INCOMING_CALL");

            Message message = Message.builder()
                    .putAllData(notificationData)
                    .setTopic(String.valueOf(callNotificationReq.getUserId()))
                    .setNotification(
                            Notification.builder()
                                    .setTitle("Incoming call")
                                    .setBody("Incoming call from "+callNotificationReq.getCallerName())
                                    .build()
                    )
                    .build();

            var response = FirebaseMessaging.getInstance().send(message);
            log.info("Sending Call notification Successful:   {} []", response);
        }catch (FirebaseMessagingException e){
            log.info(":::: ::>>> Exception sending the call notifications:    ",e);
        }
    }

}
