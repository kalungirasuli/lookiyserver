package com.celmeet.chating_service.config;


import com.celmeet.chating_service.dto.NotificationDTO;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Configuration
@EnableKafka
public class KafkaConfig {

    @Value("${kafka-setup.url}")
    private String brokerUrl;

    @Bean
    public ProducerFactory<String, NotificationDTO> producerFactory(){
        log.info(":::::::>>>> BrokerUrl :   {} []", brokerUrl);
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, brokerUrl);
        props.put(ProducerConfig.CLIENT_ID_CONFIG , "celmeet_v1");
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "*");  // Or specify your package: "com.your.package"
        props.put(JsonDeserializer.VALUE_DEFAULT_TYPE, NotificationDTO.class);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        return new DefaultKafkaProducerFactory<>(props);
    }


    @Bean
    public KafkaTemplate<String, NotificationDTO> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }


}
