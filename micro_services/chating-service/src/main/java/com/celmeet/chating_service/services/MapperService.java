package com.celmeet.chating_service.services;


import com.celmeet.chating_service.auth.AuthClient;
import com.celmeet.chating_service.dto.ChatDto;
import com.celmeet.chating_service.dto.MessageDto;
import com.celmeet.chating_service.models.Chat;
import com.celmeet.chating_service.models.ChatMessage;
import com.celmeet.chating_service.repositories.ChatRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.lang.module.ResolutionException;
import java.util.Objects;

@Service
public class MapperService {

    @Autowired
    private AuthClient authClient;

    @Autowired
    private EmojiConverter emojiConverter;


    public ChatDto chatToDto(Chat chat, String token){
        var creator = authClient.fetchUserById(chat.getCreator(), token);
        var other = authClient.fetchUserById(chat.getOther(), token);
        ChatMessage recentMsg = chat.getMessages().isEmpty()? null:
                chat.getMessages().get(chat.getMessages().size()-1);
        int creatorUnViewed = 0;
        int otherUnViewed = 0;
        int count = 0;
        int _time;
        for(var msg : chat.getMessages()){
            if(!msg.getIsViewed() && !Objects.equals(msg.getSender(), creator.getId()))
                creatorUnViewed++;
            else if(!msg.getIsViewed())
                otherUnViewed++;

        }



        return ChatDto.builder()
                .id(chat.getId())
                .chatTopic(chat.getChatTopic())
                .creator(creator)
                .other(other)
                .otherUnViewedCount(otherUnViewed)
                .creatorUnViewedCount(creatorUnViewed)
                .unViewedCount(count)
                 .lastMessage(recentMsg==null? null: messageToDto(recentMsg, token))
                .createdAt(chat.getCreatedAt())
                .build();
    }

    public MessageDto messageToDto(ChatMessage message, String token){
        var sender = authClient.fetchUserById(message.getSender(), token);
        return  MessageDto.builder()
                .id(message.getId())
                .message(emojiConverter.convertFromDatabase(message.getMessage()))
                .createdAt(message.getCreatedAt())
                .sender(sender)
                .isViewed(message.getIsViewed())
                .build();
    }

}
