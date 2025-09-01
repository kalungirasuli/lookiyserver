package com.celmeet.chating_service.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class UserDto {

    private Integer id;
    private String username;
    private String email;
    private String profileImage;
    private Double audioCallPricePerMin;
    private Double videoCallPricePerMin;

}
