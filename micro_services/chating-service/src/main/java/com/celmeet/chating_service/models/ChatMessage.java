package com.celmeet.chating_service.models;


import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.util.Date;

@Builder
@Data
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "chat-messages")
public class ChatMessage {

    @Id
    @GeneratedValue
    private Integer id;
    @Column(nullable = false)
    private Integer sender;
    @Column(nullable = false)
    private String message;
    @Builder.Default
    private Boolean isViewed = false;
    @ManyToOne
    @JoinColumn(referencedColumnName = "id", name = "chat_id")
    private Chat chat;
    @CreationTimestamp
    private Date createdAt;

}
