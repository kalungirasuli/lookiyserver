package com.celmeet.chating_service.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Date;

@Data
@Builder
public class ChatDto {

    private Integer id;
    private UserDto creator;
    private UserDto other;
    private String chatTopic;
    private Integer unViewedCount;
    private MessageDto lastMessage;
    private Integer creatorUnViewedCount;
    private Integer otherUnViewedCount;
    private Date createdAt;

}
