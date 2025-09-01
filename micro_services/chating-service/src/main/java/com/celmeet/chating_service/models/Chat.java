package com.celmeet.chating_service.models;


import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.springframework.data.annotation.LastModifiedDate;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Builder
@Data
@Entity
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "chats")
public class Chat {

    @Id
    @GeneratedValue
    private Integer id;
    @Column(nullable = false)
    private Integer creator;
    @Column(nullable = false)
    private Integer other;
    @Column(nullable = false, unique = true)
    private String chatTopic;
    @Builder.Default
    @OneToMany(mappedBy = "chat")
    private List<ChatMessage> messages = new ArrayList<>();
    @Builder.Default
    @LastModifiedDate
    @Column(nullable = false)
    private Date lastUpdateTime = new Date();
    @CreationTimestamp
    private Date createdAt;

}
