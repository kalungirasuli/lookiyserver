import { Kafka, Producer, Consumer } from 'kafkajs';
import logger from './logger';

export enum KafkaTopics {
  NETWORK_UPDATES = 'network-updates',
  MEMBER_UPDATES = 'member-updates',
  GOAL_UPDATES = 'goal-updates',
  JOIN_REQUESTS = 'join-requests',
  NOTIFICATIONS = 'notifications',
  USER_ACTIVITY = 'user-activity'
}

class KafkaService {
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'network-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2
      },
      connectionTimeout: 3000,
      requestTimeout: 30000
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });
  }

  async initialize() {
    try {
      await this.producer.connect();
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect to Kafka:', error);
      throw error;
    }
  }

  async publishEvent(topic: KafkaTopics, message: any) {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }]
      });
    } catch (error) {
      logger.error(`Failed to publish message to ${topic}:`, error);
      throw error;
    }
  }

  async subscribe(topic: KafkaTopics, handler: (message: any) => Promise<void>) {
    if (!this.consumers.has(topic)) {
      const consumer = this.kafka.consumer({ 
        groupId: `network-service-${topic}`,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        rebalanceTimeout: 60000,
        retry: {
          initialRetryTime: 100,
          retries: 8,
          maxRetryTime: 30000,
          factor: 2
        }
      });

      await consumer.connect();
      await consumer.subscribe({ 
        topic,
        fromBeginning: false 
      });

      await consumer.run({
        autoCommit: true,
        autoCommitInterval: 5000,
        autoCommitThreshold: 100,
        eachMessage: async ({ message }) => {
          try {
            const messageData = JSON.parse(message.value?.toString() || '{}');
            await handler(messageData);
          } catch (error) {
            logger.error(`Error processing message from ${topic}:`, error);
          }
        }
      });

      this.consumers.set(topic, consumer);
      logger.info(`Subscribed to topic: ${topic}`);
    }
  }

  async disconnect() {
    await this.producer.disconnect();
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
  }
}

export const kafkaService = new KafkaService();