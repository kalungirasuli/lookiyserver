package com.celmeet.chating_service.auth;

import com.celmeet.chating_service.dto.UserDto;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.common.errors.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Service
public class AuthClient {

    private final String authUrl;
    private final RestTemplate restTemplate = new RestTemplate();
    public AuthClient(
            @Value("${services.auth.url}") String url
    ){
        this.authUrl = url;
        log.info("::::>>> AuthUrl:  {} []", authUrl);
    }

    public UserDto fetchUserByToken(String token){
        try{
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", token);

            HttpEntity<Void> entity = new HttpEntity<>(null, headers);
            ResponseEntity<UserDto> response = restTemplate.exchange(
                    authUrl + "fetchProfile", HttpMethod.GET, entity, UserDto.class
            );

            return response.getBody();
        }catch (Exception e){
            throw new ResourceNotFoundException("User with the provided token not found");
        }
    }


    public UserDto fetchUserById(int userId, String token){
        try{
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", token);

            HttpEntity<Void> entity = new HttpEntity<>(null, headers);
            ResponseEntity<UserDto> response = restTemplate.exchange(
                    authUrl + "getUserByIdWallet?id=" + userId, HttpMethod.GET, entity, UserDto.class
            );

            return response.getBody();
        }catch (Exception e){
            throw  new ResourceNotFoundException("User with the provided id not found");
        }
    }


}
