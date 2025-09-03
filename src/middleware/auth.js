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
exports.authenticate = authenticate;
const token_1 = require("../utils/token");
const db_1 = __importDefault(require("../utils/db"));
const logger_1 = __importDefault(require("../utils/logger"));
function authenticate(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const authHeader = req.headers.authorization;
            if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
                return res.status(401).json({ message: 'No token provided' });
            }
            const token = authHeader.split(' ')[1];
            const decoded = (0, token_1.verifyToken)(token);
            if (!decoded || !decoded.sessionId) {
                return res.status(401).json({ message: 'Invalid token' });
            }
            // Verify session is still active
            const sessions = yield (0, db_1.default) `
      SELECT s.id, s.user_id, s.is_active, u.email
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ${decoded.sessionId}
        AND s.is_active = true
        AND s.expires_at > NOW()
    `;
            if (sessions.length === 0) {
                return res.status(401).json({ message: 'Session expired or invalid' });
            }
            const session = sessions[0];
            // Update last active timestamp
            yield (0, db_1.default) `
      UPDATE user_sessions 
      SET last_active = NOW() 
      WHERE id = ${session.id}
    `;
            req.user = {
                id: session.user_id,
                email: session.email,
                roles: decoded.roles || [],
                sessionId: session.id
            };
            next();
        }
        catch (error) {
            logger_1.default.error('Authentication error', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(401).json({ message: 'Authentication failed' });
        }
    });
}
