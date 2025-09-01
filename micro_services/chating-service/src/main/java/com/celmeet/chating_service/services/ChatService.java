package com.celmeet.chating_service.services;

import com.celmeet.chating_service.auth.AuthClient;
import com.celmeet.chating_service.dto.MessageReq;
import com.celmeet.chating_service.exceptions.ResourceNotFoundException;
import com.celmeet.chating_service.models.Chat;
import com.celmeet.chating_service.models.ChatMessage;
import com.celmeet.chating_service.repositories.ChatMessageRepository;
import com.celmeet.chating_service.repositories.ChatRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.Objects;

@Slf4j
@Service
public class ChatService {

    @Autowired
    private MapperService mapperService;

    @Autowired
    private ChatRepository chatRepository;

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private AuthClient authClient;

    @Autowired
    private ProducerService producerService;

    @Autowired
    private EmojiConverter emojiConverter;



    public int createChat(Integer otherId, String token) {
        var creator  = authClient.fetchUserByToken(token);
        var other  = authClient.fetchUserById(otherId, token);

        var chatOpt = chatRepository.findByChatTopic(String.valueOf(creator.hashCode()+other.hashCode()));

        if(chatOpt.isPresent())
            return chatOpt.get().getId();

        var chat = chatRepository.save(
                Chat.builder()
                        .chatTopic(String.valueOf(creator.hashCode()+other.hashCode()))
                        .creator(creator.getId())
                        .other(other.getId())
                        .build()
        );

        return chat.getId();
    }

    public void sendMessage(Integer chatId, MessageReq messageReq, String token) {
        var sender = authClient.fetchUserByToken(token);
        var chat  = chatRepository.findById(chatId).orElseThrow(
                ()-> new ResourceNotFoundException("Chat with the provided id not found")
        );

        var message = chatMessageRepository.save(
                ChatMessage.builder()
                        .chat(chat)
                        .message(emojiConverter.convertToDatabase(messageReq.getMessage()))
                        .sender(sender.getId())
                        .build()
        );

        chat.setLastUpdateTime(new Date());
        chatRepository.save(chat);
        producerService.sendNotification(
                sender.getUsername()+ " sent you a message.",
                Objects.equals(chat.getOther(), sender.getId()) ? chat.getCreator(): chat.getOther(),
                message.getMessage()
        );

        try{
            markAllChatMessagesAsReadForUser(chatId, token);
        }catch (Exception e){
            log.info("::::>>>> Exception marking as read::   ",e);
        }
    }

    public Page<Chat> getUserChats(Integer userId, Integer page, Integer size) {
        Sort sort = Sort.by(
                Sort.Direction.DESC, "lastUpdateTime"
        );
        Pageable pageable = PageRequest.of(page, size, sort);

        return chatRepository.findAllByCreatorOrOther(userId, userId, pageable);
    }

    public Page<ChatMessage> getChatMessages(Integer chatId, Integer page, Integer size) {
        Sort sort = Sort.by(
                Sort.Direction.DESC, "createdAt"
        );
        Pageable pageable = PageRequest.of(page, size, sort);
        var chat  = chatRepository.findById(chatId).orElseThrow(
                ()-> new ResourceNotFoundException("Chat with the provided id not found")
        );
        return chatMessageRepository.findAllByChat(chat, pageable);
    }

    public void markChatAsViewed(Integer messageId) {
        var msg = chatMessageRepository.findById(messageId).orElseThrow(
                ()-> new ResourceNotFoundException("Message with Id not found")
        );

        msg.setIsViewed(true);
        chatMessageRepository.save(msg);
    }


    public void markAllChatMessagesAsReadForUser(
            int chatId,
            String token
    ){
        var chat = chatRepository.findById(chatId).orElseThrow(
                ()-> new ResourceNotFoundException(":::>> Chat with the provided id not found")
        );

        var user = authClient.fetchUserByToken(token);

        boolean isCreator = Objects.equals(chat.getCreator(), user.getId());

        for(var msg: chat.getMessages()){
            if(!Objects.equals(msg.getSender(), user.getId()) && !msg.getIsViewed()){
                msg.setIsViewed(true);
                chatMessageRepository.save(msg);
            }

        }
    }


    public int getUserChatUnreadMessages(
            String token,
            int chatId
    ){
      return 0;
    }

    public int getUserUnreadMessages(String token) {
        var user = authClient.fetchUserByToken(token);

        var userChats = chatRepository.findAllByCreatorOrOther(user.getId(), user.getId());
        int totalCount = 0;
        for(var _chat : userChats){
            int count = 0;
            for(var msg : _chat.getMessages()){
                if(!msg.getIsViewed() && !Objects.equals(msg.getSender(), user.getId()))
                    count++;

                if(count>0){
                    totalCount++;
                    break;
                }

            }
        }
        return totalCount;
    }


    public Chat getChat(Integer id) {

        return chatRepository.findById(id).orElseThrow(
                ()-> new ResourceNotFoundException("New resource not found exception")
        );
    }
}
