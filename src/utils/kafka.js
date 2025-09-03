"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kafkaService = exports.KafkaTopics = void 0;
const kafkajs_1 = require("kafkajs");
const logger_1 = __importDefault(require("./logger"));
var KafkaTopics;
(function (KafkaTopics) {
    KafkaTopics["NETWORK_UPDATES"] = "network-updates";
    KafkaTopics["MEMBER_UPDATES"] = "member-updates";
    KafkaTopics["GOAL_UPDATES"] = "goal-updates";
    KafkaTopics["JOIN_REQUESTS"] = "join-requests";
    KafkaTopics["NOTIFICATIONS"] = "notifications";
    KafkaTopics["USER_ACTIVITY"] = "user-activity";
})(KafkaTopics || (exports.KafkaTopics = KafkaTopics = {}));
class KafkaService {
    constructor() {
        this.consumers = new Map();
        this.kafka = new kafkajs_1.Kafka({
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
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.producer.connect();
                logger_1.default.info('Kafka producer connected');
            }
            catch (error) {
                logger_1.default.error('Failed to connect to Kafka:', error);
                throw error;
            }
        });
    }
    publishEvent(topic, message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.producer.send({
                    topic,
                    messages: [{ value: JSON.stringify(message) }]
                });
            }
            catch (error) {
                logger_1.default.error(`Failed to publish message to ${topic}:`, error);
                throw error;
            }
        });
    }
    subscribe(topic, handler) {
        return __awaiter(this, void 0, void 0, function* () {
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
                yield consumer.connect();
                yield consumer.subscribe({
                    topic,
                    fromBeginning: false
                });
                yield consumer.run({
                    autoCommit: true,
                    autoCommitInterval: 5000,
                    autoCommitThreshold: 100,
                    eachMessage: (_a) => __awaiter(this, [_a], void 0, function* ({ message }) {
                        var _b;
                        try {
                            const messageData = JSON.parse(((_b = message.value) === null || _b === void 0 ? void 0 : _b.toString()) || '{}');
                            yield handler(messageData);
                        }
                        catch (error) {
                            logger_1.default.error(`Error processing message from ${topic}:`, error);
                        }
                    })
                });
                this.consumers.set(topic, consumer);
                logger_1.default.info(`Subscribed to topic: ${topic}`);
            }
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.producer.disconnect();
            for (const consumer of this.consumers.values()) {
                yield consumer.disconnect();
            }
        });
    }
}
exports.kafkaService = new KafkaService();
