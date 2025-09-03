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
exports.cacheSet = cacheSet;
exports.cacheGet = cacheGet;
exports.cacheDelete = cacheDelete;
exports.cacheInvalidatePattern = cacheInvalidatePattern;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("./logger"));
const redisClient = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});
redisClient.on('error', (err) => {
    logger_1.default.error('Redis Client Error', {
        error: err instanceof Error ? err.message : 'Unknown error'
    });
});
redisClient.on('connect', () => {
    logger_1.default.info('Redis Client Connected');
});
// Cache helpers
function cacheSet(key, value, expireSeconds) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const serialized = JSON.stringify(value);
            if (expireSeconds) {
                yield redisClient.setex(key, expireSeconds, serialized);
            }
            else {
                yield redisClient.set(key, serialized);
            }
        }
        catch (error) {
            logger_1.default.error('Redis Cache Set Error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                key
            });
        }
    });
}
function cacheGet(key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const value = yield redisClient.get(key);
            if (!value)
                return null;
            return JSON.parse(value);
        }
        catch (error) {
            logger_1.default.error('Redis Cache Get Error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                key
            });
            return null;
        }
    });
}
function cacheDelete(key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield redisClient.del(key);
        }
        catch (error) {
            logger_1.default.error('Redis Cache Delete Error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                key
            });
        }
    });
}
function cacheInvalidatePattern(pattern) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const keys = yield redisClient.keys(pattern);
            if (keys.length > 0) {
                yield redisClient.del(...keys);
            }
        }
        catch (error) {
            logger_1.default.error('Redis Cache Pattern Invalidation Error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                pattern
            });
        }
    });
}
exports.default = redisClient;
