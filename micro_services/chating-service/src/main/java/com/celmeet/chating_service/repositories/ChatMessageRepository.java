package com.celmeet.chating_service.repositories;

import com.celmeet.chating_service.models.Chat;
import com.celmeet.chating_service.models.ChatMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Integer> {

    Page<ChatMessage> findAllByChat(Chat chat, Pageable pageable);

}
