"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = __importDefault(require("./logger"));
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const TOKEN_EXPIRY = '28 days'; // 28 days for account deletion recovery
function generateToken(payload) {
    try {
        return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    }
    catch (error) {
        logger_1.default.error('Token generation failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: payload.userId
        });
        throw error;
    }
}
function verifyToken(token) {
    try {
        const result = jsonwebtoken_1.default.decode(token);
        const issuedAt = new Date(result.iat * 1000).toLocaleString();
        const expiresAt = new Date(result.exp * 1000).toLocaleString();
        return jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch (error) {
        logger_1.default.error('Token verification failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
}
