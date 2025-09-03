package com.celmeet.chating_service.controllers;


import com.celmeet.chating_service.dto.ChatDto;
import com.celmeet.chating_service.dto.MessageReq;
import com.celmeet.chating_service.models.Chat;
import com.celmeet.chating_service.models.ChatMessage;
import com.celmeet.chating_service.services.ChatService;
import com.celmeet.chating_service.services.MapperService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/chats/")
public class ChatsController {

    @Autowired
    private ChatService chatService;

    @Autowired
    private MapperService mapperService;


    @PostMapping("create-chat")
    public ResponseEntity<Integer> createChat(
            @RequestParam("other") Integer otherId,
            @RequestHeader("Authorization") String token
    ){
        Integer chatId = chatService.createChat(otherId, token);
        return  ResponseEntity.ok(chatId);
    }


    @PostMapping(value = "sendMessage/{chatId}", produces = "application/json;charset=UTF-8")
    public ResponseEntity<Void> sendMessage(
            @PathVariable("chatId") Integer chatId,
            @RequestBody MessageReq messageReq,
            @RequestHeader("Authorization") String token
            ){
        chatService.sendMessage(chatId, messageReq, token);
        return ResponseEntity.ok().build();
    }


    @GetMapping("getUserChats/{id}")
    public ResponseEntity<Map<String, Object>> getUserChats(
            @PathVariable("id") Integer userId,
            @RequestParam(name = "size", defaultValue ="10") Integer size,
            @RequestParam(name = "page", defaultValue ="0") Integer page,
            @RequestHeader("Authorization") String token
    ){
        Map<String, Object> response = new HashMap<>();
        Page<Chat> chatPage = chatService.getUserChats(userId, page, size);

        response.put("chats", chatPage.getContent().stream().map(
                (element)-> mapperService.chatToDto(element, token)
        ).toList());

        response.put("hasNext", chatPage.hasNext());
        response.put("hasPrevious", chatPage.hasPrevious());
        response.put("totalItems", chatPage.getTotalElements());

        return ResponseEntity.ok(response);
    }


    @GetMapping("getChat/{id}")
    public ResponseEntity<ChatDto> getChat(
            @PathVariable("id") Integer id,
            @RequestHeader("Authorization") String token
    ){
        Chat chat = chatService.getChat(id);
        return ResponseEntity.ok(mapperService.chatToDto(chat, token));
    }

    @GetMapping("getChatMessages/{id}")
    public ResponseEntity<Map<String, Object>> getChatMessages(
            @PathVariable("id") Integer chatId,
            @RequestParam(name = "size", defaultValue ="10") Integer size,
            @RequestParam(name = "page", defaultValue ="0") Integer page,
            @RequestHeader("Authorization") String token
    ){
        Map<String, Object> response = new HashMap<>();
        Page<ChatMessage> chatPage = chatService.getChatMessages(chatId, page, size);

        response.put("messages", chatPage.getContent().stream().map(
                (element)-> mapperService.messageToDto(element, token)
        ).toList());

        response.put("hasNext", chatPage.hasNext());
        response.put("hasPrevious", chatPage.hasPrevious());

        return ResponseEntity.ok(response);
    }


    @PutMapping("markMessageAsViewed/{id}")
    public ResponseEntity<Void> markMessageAsViewed(
            @PathVariable("id") Integer messageId
    ){
        chatService.markChatAsViewed(messageId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("userUnreadMessages")
    public ResponseEntity<Map<String, Object>> getUserTotalUnreadMessages(
            @RequestHeader("Authorization") String token
    ){
        int count = chatService.getUserUnreadMessages(token);
        Map<String, Object> response = new HashMap<>();
        response.put("unreadMessages", count);
        return ResponseEntity.ok(response);
    }

    @PutMapping("markAllAsViewed/{chatId}")
    public ResponseEntity<Void> markAllChatMessageAsReadForUser(
            @PathVariable("chatId") Integer chatId,
            @RequestHeader("Authorization") String token
    ){
        chatService.markAllChatMessagesAsReadForUser(chatId, token);
        return ResponseEntity.ok().build();
    }

}
