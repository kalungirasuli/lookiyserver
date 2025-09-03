package com.celmeet.chating_service.repositories;

import com.celmeet.chating_service.models.Chat;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChatRepository extends JpaRepository<Chat, Integer> {

    List<Chat> findAllByCreatorOrOther(Integer creator, Integer other);
    Page<Chat> findAllByCreatorOrOther(Integer creator, Integer other, Pageable pageable);
    Optional<Chat> findByChatTopic(String id);

}
