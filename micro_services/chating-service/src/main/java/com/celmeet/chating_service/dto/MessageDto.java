package com.celmeet.chating_service.dto;

import lombok.Builder;
import lombok.Data;

import java.util.Date;

@Builder
@Data
public class MessageDto {

    private Integer id;
    private String message;
    private Date createdAt;
    private UserDto sender;
    private Boolean isViewed;

}
