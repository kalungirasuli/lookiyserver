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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.verifyEmail = verifyEmail;
exports.verifyLoginDevice = verifyLoginDevice;
exports.logout = logout;
exports.requestPasswordReset = requestPasswordReset;
exports.resetPassword = resetPassword;
exports.requestAccountDeletion = requestAccountDeletion;
exports.recoverAccount = recoverAccount;
exports.processPermanentDeletions = processPermanentDeletions;
exports.loginCheck = loginCheck;
exports.editProfile = editProfile;
exports.getPrivacySettings = getPrivacySettings;
exports.updatePrivacySettings = updatePrivacySettings;
const db_1 = __importDefault(require("../utils/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const email_1 = require("../utils/email");
const logger_1 = __importDefault(require("../utils/logger"));
const ua_parser_js_1 = require("ua-parser-js");
const token_1 = require("../utils/token");
const storage_1 = require("../utils/storage");
const avatar_1 = require("../utils/avatar");
const redis_1 = require("../utils/redis");
const kafka_1 = require("../utils/kafka");
const socket_1 = require("../utils/socket");
function register(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { name, email, password, description, interests, isPublic } = req.body;
        if (!name || !email || !password) {
            logger_1.default.warn('Registration attempt with missing fields', { email });
            return res.status(400).json({ message: 'Missing required fields' });
        }
        logger_1.default.info('Starting user registration', { email });
        const hashedPassword = yield bcrypt_1.default.hash(password, 10);
        const createdAt = new Date();
        const updatedAt = new Date();
        const isVerified = false;
        try {
            // First create the user to get the ID
            const result = yield (0, db_1.default) `
      INSERT INTO users (
        name, email, password, description, interests, 
        isVerified, isPublic, createdAt, updatedAt
      ) VALUES (
        ${name}, ${email}, ${hashedPassword}, ${description || null}, 
        ${interests ? JSON.stringify(interests) : null}, ${isVerified}, 
        ${typeof isPublic === 'boolean' ? isPublic : false}, ${createdAt}, ${updatedAt}
      )
      RETURNING id
    `;
            const userId = result[0].id;
            // Generate and upload default avatar
            try {
                const avatarUrl = yield (0, avatar_1.generateAndUploadAvatar)(userId);
                yield (0, db_1.default) `
        UPDATE users
        SET avatar = ${avatarUrl}
        WHERE id = ${userId}
      `;
            }
            catch (avatarError) {
                logger_1.default.error('Failed to generate avatar', {
                    userId,
                    error: avatarError instanceof Error ? avatarError.message : 'Unknown error'
                });
                // Continue registration even if avatar generation fails
            }
            logger_1.default.info('User registered successfully', { userId, email });
            yield (0, email_1.sendVerificationEmail)(email, userId);
            logger_1.default.info('Verification email sent', { userId, email });
            // Publish user registration event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'user_registered',
                userId,
                data: {
                    email,
                    name,
                    isVerified: false,
                    timestamp: new Date()
                }
            });
            res.status(201).json({ message: 'User registered. Please verify your email.' });
        }
        catch (err) {
            logger_1.default.error('Registration failed', {
                email,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Registration failed', error: err });
        }
    });
}
function verifyEmail(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { token } = req.query;
        if (!token) {
            logger_1.default.warn('Email verification attempt without token');
            return res.status(400).json({ message: 'Missing token' });
        }
        logger_1.default.info('Starting email verification', { token });
        try {
            // check if user exits
            const result = yield (0, db_1.default) `
      UPDATE users 
      SET isVerified = true,
          updatedAt = NOW()
      WHERE id = ${token} 
        AND isVerified = false
      RETURNING *
    `;
            if (result.length === 0) {
                logger_1.default.warn('Email verification failed - invalid token or already verified', { token });
                return res.status(400).json({ message: 'Invalid token or email already verified' });
            }
            logger_1.default.info('Email verified successfully', {
                userId: token,
                email: result[0].email
            });
            // Publish email verification event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'email_verified',
                userId: token,
                data: {
                    timestamp: new Date()
                }
            });
            res.json({ message: 'Email verified successfully' });
        }
        catch (err) {
            logger_1.default.error('Email verification failed', {
                token,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Verification failed', error: err });
        }
    });
}
function checkLoginAttempts(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const attempts = yield (0, db_1.default) `
    SELECT *
    FROM login_attempts
    WHERE user_id = ${userId}
      AND attempted_at > ${twentyFourHoursAgo}
      AND is_successful = false
    ORDER BY attempted_at DESC
    LIMIT 3
  `;
        return attempts.length >= 3;
    });
}
function suspendAccount(userId, email, reason) {
    return __awaiter(this, void 0, void 0, function* () {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
        // Create suspension record
        yield (0, db_1.default) `
    INSERT INTO account_suspensions (
      user_id, reason, expires_at
    ) VALUES (
      ${userId}, ${reason}, ${expiresAt}
    )
  `;
        // Deactivate all sessions
        yield (0, db_1.default) `
    UPDATE user_sessions
    SET is_active = false
    WHERE user_id = ${userId}
  `;
        // Cache suspension status
        yield (0, redis_1.cacheSet)(`suspension:${email}`, {
            userId,
            reason,
            expiresAt
        }, 24 * 60 * 60); // 24 hours
        // Publish suspension event
        yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
            type: 'account_suspended',
            userId,
            data: {
                reason,
                expiresAt,
                timestamp: new Date()
            }
        });
        // Send suspension notification
        yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.NOTIFICATIONS, {
            type: 'account_suspended',
            userId,
            title: 'Account Suspended',
            message: `Your account has been temporarily suspended: ${reason}`,
            data: {
                expiresAt,
                reason
            }
        });
        // Force disconnect user's sockets
        (0, socket_1.getSocketService)().emitToUser(userId, 'account:suspended', {
            reason,
            expiresAt
        });
        logger_1.default.warn('Account suspended', { userId, reason, expiresAt });
    });
}
function isAccountSuspended(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const suspensions = yield (0, db_1.default) `
    SELECT *
    FROM account_suspensions
    WHERE user_id = ${userId}
      AND expires_at > NOW()
    ORDER BY expires_at DESC
    LIMIT 1
  `;
        return suspensions.length > 0 ? suspensions[0].expires_at : null;
    });
}
function login(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { email, password } = req.body;
        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
        if (!email || !password) {
            logger_1.default.warn('Login attempt with missing credentials');
            return res.status(400).json({ message: 'Email and password are required' });
        }
        try {
            const users = yield (0, db_1.default) `
      SELECT * FROM users WHERE email = ${email}
    `;
            if (users.length === 0) {
                logger_1.default.warn('Login attempt with non-existent email', { email });
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            const user = users[0];
            // Check for account suspension
            const suspensionExpiry = yield isAccountSuspended(user.id);
            if (suspensionExpiry) {
                logger_1.default.warn('Login attempt on suspended account', { email });
                return res.status(403).json({
                    message: 'Account is temporarily suspended',
                    suspensionExpiry
                });
            }
            const isValidPassword = yield bcrypt_1.default.compare(password, user.password);
            // Record the login attempt
            yield (0, db_1.default) `
      INSERT INTO login_attempts (
        user_id, ip_address, is_successful
      ) VALUES (
        ${user.id}, ${ipAddress}, ${isValidPassword}
      )
    `;
            if (!isValidPassword) {
                // Check if we should suspend the account
                if (yield checkLoginAttempts(user.id)) {
                    yield suspendAccount(user.id, user.email, 'Multiple failed login attempts detected');
                    return res.status(403).json({
                        message: 'Account has been temporarily suspended due to multiple failed login attempts'
                    });
                }
                logger_1.default.warn('Login attempt with invalid password', { email });
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            // Check if email is verified - prevent login if not verified
            if (user.isverified === false) {
                logger_1.default.warn('Login attempt with unverified account', { email });
                return res.status(403).json({ message: 'Please verify your email first' });
            }
            const userAgent = req.headers['user-agent'] || '';
            const parser = new ua_parser_js_1.UAParser();
            parser.setUA(userAgent);
            const deviceInfo = {
                browser: parser.getBrowser(),
                os: parser.getOS(),
                device: parser.getDevice()
            };
            const deviceId = crypto.randomUUID();
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            const sessions = yield (0, db_1.default) `
      INSERT INTO user_sessions (
        user_id, device_id, device_info, ip_address, expires_at
      ) VALUES (
        ${user.id}, 
        ${deviceId}, 
        ${JSON.stringify(deviceInfo)}, 
        ${ipAddress}, 
        ${expiresAt}
      )
      RETURNING id
    `;
            const sessionId = sessions[0].id;
            console.log('sessionId', { sessionId });
            // Generate JWT with session info
            const token = (0, token_1.generateToken)({
                userId: user.id,
                email: user.email,
                sessionId
            });
            // Check for other active sessions
            const activeSessions = yield (0, db_1.default) `
      SELECT device_info, ip_address, created_at
      FROM user_sessions
      WHERE user_id = ${user.id}
        AND is_active = true
        AND id != ${sessionId}
    `;
            // if (activeSessions.length > 0) {
            //   await sendLoginAlertEmail(
            //     user.email,
            //     deviceInfo,
            //     ipAddress,
            //     sessionId,
            //     user.id
            //   );
            // }
            logger_1.default.info('User logged in successfully', {
                userId: user.id,
                email: user.email,
                deviceId,
                sessionId
            });
            res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    isVerified: user.isverified
                }
            });
        }
        catch (err) {
            logger_1.default.error('Login failed', {
                email,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Login failed', error: err });
        }
    });
}
function verifyLoginDevice(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { token: sessionId, userId, action } = req.query;
        try {
            if (action === 'true') {
                // Approve device
                yield (0, db_1.default) `
        UPDATE user_sessions
        SET is_active = true
        WHERE id = ${sessionId}
          AND user_id = ${userId}
      `;
                logger_1.default.info('Device approved', { sessionId, userId });
                res.json({ message: 'Device approved successfully' });
            }
            else {
                // Reject device and suspend session
                yield (0, db_1.default) `
        UPDATE user_sessions
        SET is_active = false
        WHERE id = ${sessionId}
          AND user_id = ${userId}
      `;
                logger_1.default.info('Device rejected and session suspended', { sessionId, userId });
                res.json({ message: 'Device rejected and session suspended' });
            }
        }
        catch (err) {
            logger_1.default.error('Device verification failed', {
                sessionId,
                userId,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Device verification failed', error: err });
        }
    });
}
function logout(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const authHeader = req.headers.authorization;
        if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
            return res.status(401).json({ message: 'No token provided' });
        }
        try {
            const token = authHeader.split(' ')[1];
            const decoded = (0, token_1.verifyToken)(token);
            if (!(decoded === null || decoded === void 0 ? void 0 : decoded.sessionId)) {
                return res.status(401).json({ message: 'Invalid token' });
            }
            // Deactivate session
            yield (0, db_1.default) `
      UPDATE user_sessions
      SET is_active = false
      WHERE id = ${decoded.sessionId}
    `;
            // Publish logout event
            if (decoded.userId) {
                yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                    type: 'logout',
                    userId: decoded.userId,
                    data: {
                        sessionId: decoded.sessionId,
                        timestamp: new Date()
                    }
                });
                // Broadcast offline status
                (0, socket_1.getSocketService)().broadcastUserStatus(decoded.userId, 'offline');
            }
            logger_1.default.info('User logged out successfully', {
                sessionId: decoded.sessionId,
                userId: decoded.userId
            });
            res.json({ message: 'Logged out successfully' });
        }
        catch (err) {
            logger_1.default.error('Logout failed', {
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Logout failed', error: err });
        }
    });
}
function requestPasswordReset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        try {
            const users = yield (0, db_1.default) `
      SELECT * FROM users WHERE email = ${email}
    `;
            if (users.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }
            const user = users[0];
            const resetToken = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
            yield (0, db_1.default) `
      INSERT INTO password_reset_tokens (
        user_id, token, expires_at
      ) VALUES (
        ${user.id}, ${resetToken}, ${expiresAt}
      )
    `;
            // await sendPasswordResetEmail(email, resetToken);
            logger_1.default.info('Password reset requested', { userId: user.id, email, resetToken });
            // Publish password reset request event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'password_reset_requested',
                userId: user.id,
                data: {
                    timestamp: new Date()
                }
            });
            res.json({ message: 'Password reset email sent' });
        }
        catch (err) {
            logger_1.default.error('Password reset request failed', {
                email,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            console.error('Password reset request error', err);
            res.status(500).json({ message: 'Failed to process password reset request' });
        }
    });
}
function resetPassword(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Resetting password for token:', req.body);
        const { Token, newPassword } = req.body;
        if (!Token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }
        try {
            const resetTokens = yield (0, db_1.default) `
      SELECT user_id, used
      FROM password_reset_tokens
      WHERE token = ${Token}
        AND expires_at > NOW()
        AND used = false
    `;
            if (resetTokens.length === 0) {
                return res.status(400).json({ message: 'Invalid or expired reset token' });
            }
            const userId = resetTokens[0].user_id;
            const hashedPassword = yield bcrypt_1.default.hash(newPassword, 10);
            // Update password and mark token as used in a transaction
            yield db_1.default.begin((sql) => __awaiter(this, void 0, void 0, function* () {
                yield sql `
        UPDATE users
        SET password = ${hashedPassword}, 
            updatedAt = NOW()
        WHERE id = ${userId}
      `;
                yield sql `
        UPDATE password_reset_tokens
        SET used = true
        WHERE token = ${Token}
      `;
            }));
            // Publish password reset completion event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'password_reset_completed',
                userId,
                data: {
                    timestamp: new Date()
                }
            });
            logger_1.default.info('Password reset successful', { userId });
            res.json({ message: 'Password reset successful' });
        }
        catch (err) {
            logger_1.default.error('Password reset failed', {
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Failed to reset password' });
        }
    });
}
function requestAccountDeletion(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        console.log('Requesting account deletion for user:', { userId });
        try {
            const user = yield (0, db_1.default) `
      SELECT * FROM users WHERE id = ${userId}
    `;
            console.log('User found:', { message: "getting user by id" });
            if (user.length === 0) {
                return res.status(404).json({ message: 'User not found' });
                console.log('User not found:', { message: "user not found" });
            }
            const now = new Date();
            const permanentDeletionDate = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000); // 28 days
            console.log('Setting up account deletion:', { message: "setting up account deletion" });
            const recoveryToken = crypto.randomUUID();
            console.log('Recovery token generated:', { recoveryToken });
            yield db_1.default.begin((sql) => __awaiter(this, void 0, void 0, function* () {
                // Update user status
                yield sql `
        UPDATE users 
        SET account_status = 'pending_deletion',
            deletion_requested_at = ${now}
        WHERE id = ${userId}
      `;
                // Create deletion record
                yield sql `
        INSERT INTO deleted_accounts (
          user_id, deletion_requested_at, permanent_deletion_date,
          recovery_token, reason, is_permanent
        ) VALUES (
          ${userId}, ${now}, ${permanentDeletionDate},
          ${recoveryToken}, ${req.body.reason || null}, false
        )
      `;
                // Deactivate all sessions
                yield sql `
        UPDATE user_sessions
        SET is_active = false
        WHERE user_id = ${userId}
      `;
            }));
            console.log('Account deletion record created:', { message: "account deletion record created" });
            // await sendAccountDeletionEmail(user[0].email, recoveryToken);
            console.log('Account deletion email sent:', { message: "account deletion email sent" });
            logger_1.default.info('Account deletion requested', {
                userId,
                permanentDeletionDate,
                recoveryToken
            });
            // Publish account deletion request event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'account_deletion_requested',
                userId,
                data: {
                    timestamp: new Date()
                }
            });
            res.json({
                message: 'Account deletion requested. You have 28 days to recover your account.'
            });
        }
        catch (err) {
            logger_1.default.error('Account deletion request failed', {
                userId,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Failed to process deletion request' });
        }
    });
}
function recoverAccount(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ message: 'Recovery token is required' });
        }
        try {
            const deletionRecords = yield (0, db_1.default) `
      SELECT da.*, u.email
      FROM deleted_accounts da
      JOIN users u ON u.id = da.user_id
      WHERE da.recovery_token = ${token}
        AND da.is_permanent = false
        AND da.permanent_deletion_date > NOW()
    `;
            if (deletionRecords.length === 0) {
                return res.status(400).json({
                    message: 'Invalid or expired recovery token'
                });
            }
            const deletionRecord = deletionRecords[0];
            if (!deletionRecord.email) {
                logger_1.default.error('Email not found for deletion record', { userId: deletionRecord.user_id });
                return res.status(500).json({ message: 'Account recovery failed' });
            }
            yield db_1.default.begin((sql) => __awaiter(this, void 0, void 0, function* () {
                // Reactivate user
                yield sql `
        UPDATE users 
        SET account_status = 'active',
            deletion_requested_at = null
        WHERE id = ${deletionRecord.user_id}
      `;
                // Mark deletion record as recovered
                yield sql `
        DELETE FROM deleted_accounts
        WHERE user_id = ${deletionRecord.user_id}
      `;
            }));
            // await sendAccountRecoveredEmail(deletionRecord.email);
            logger_1.default.info('Account recovered successfully', {
                userId: deletionRecord.user_id
            });
            // Publish account recovery event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'account_recovered',
                userId: deletionRecord.user_id,
                data: {
                    timestamp: new Date()
                }
            });
            res.json({ message: 'Account recovered successfully' });
        }
        catch (err) {
            logger_1.default.error('Account recovery failed', {
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Failed to recover account' });
        }
    });
}
// Function to permanently delete expired accounts (should be run by a scheduled job)
function processPermanentDeletions() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const expiredAccounts = yield (0, db_1.default) `
      SELECT da.*, u.email
      FROM deleted_accounts da
      JOIN users u ON u.id = da.user_id
      WHERE da.permanent_deletion_date <= NOW()
        AND da.is_permanent = false
    `;
            for (const account of expiredAccounts) {
                yield db_1.default.begin((sql) => __awaiter(this, void 0, void 0, function* () {
                    // Mark account as permanently deleted
                    yield sql `
          UPDATE deleted_accounts
          SET is_permanent = true
          WHERE user_id = ${account.user_id}
        `;
                    // Update user status
                    yield sql `
          UPDATE users
          SET account_status = 'deleted',
              email = CONCAT('deleted_', ${account.user_id}, '_', email),
              password = NULL,
              name = 'Deleted User',
              description = NULL,
              interests = NULL,
              avatar = NULL
          WHERE id = ${account.user_id}
        `;
                    // Send email only if we have a valid email address
                    if (account.email) {
                        try {
                            yield (0, email_1.sendPermanentDeletionEmail)(account.email);
                        }
                        catch (emailError) {
                            logger_1.default.error('Failed to send permanent deletion email', {
                                userId: account.user_id,
                                error: emailError instanceof Error ? emailError.message : 'Unknown error'
                            });
                            // Continue with deletion even if email fails
                        }
                    }
                }));
                logger_1.default.info('Account permanently deleted', {
                    userId: account.user_id
                });
            }
        }
        catch (err) {
            logger_1.default.error('Permanent deletion processing failed', {
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            throw err;
        }
    });
}
// Login handler modification to check for deletion status
const existingLoginFunction = login;
function loginCheck(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { email } = req.body;
            // Check cache for user suspension status
            const suspensionKey = `suspension:${email}`;
            const cachedSuspension = yield (0, redis_1.cacheGet)(suspensionKey);
            if (cachedSuspension) {
                return res.status(403).json({
                    message: 'Account temporarily suspended',
                    suspensionExpiry: new Date(cachedSuspension.expiresAt)
                });
            }
            const users = yield (0, db_1.default) `
      SELECT * FROM users 
      WHERE email = ${email}
        AND account_status != 'deleted'
    `;
            if (users.length > 0) {
                const user = users[0];
                if (user.account_status === 'pending_deletion') {
                    const deletionRecord = yield (0, db_1.default) `
          SELECT * FROM deleted_accounts
          WHERE user_id = ${user.id}
            AND is_permanent = false
        `;
                    if (deletionRecord.length > 0) {
                        return res.status(403).json({
                            message: 'Account pending deletion. Please check your email for recovery instructions.'
                        });
                    }
                }
                // Handle login separately to properly manage response
                const loginResponse = yield login(req, res);
                // If login was successful and user data exists
                if (user) {
                    yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                        type: 'login',
                        userId: user.id,
                        data: {
                            email: user.email,
                            timestamp: new Date()
                        }
                    });
                    // Broadcast user status
                    (0, socket_1.getSocketService)().broadcastUserStatus(user.id, 'online');
                }
                return loginResponse;
            }
            return login(req, res);
        }
        catch (err) {
            logger_1.default.error('Login check failed', {
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            return res.status(500).json({ message: 'Login failed' });
        }
    });
}
function editProfile(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('Starting editProfile with request:', {
            body: req.body,
            file: req.file,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id
        });
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.id;
        if (!userId) {
            console.log('Authentication failed - no userId found');
            return res.status(401).json({ message: 'Authentication required' });
        }
        try {
            console.log('Fetching user from database:', { userId });
            // Verify user exists
            const users = yield (0, db_1.default) `
      SELECT * FROM users WHERE id = ${userId}
    `;
            if (users.length === 0) {
                console.log('User not found in database:', { userId });
                return res.status(404).json({ message: 'User not found' });
            }
            const updates = [];
            const { name, description, interests, isPublic, email } = req.body || {};
            console.log('Processing update fields:', { name, description, interests, isPublic, email });
            // Handle file upload if present
            let avatarUrl;
            if (req.file) {
                console.log('Processing file upload:', {
                    originalName: req.file.originalname,
                    size: req.file.size,
                    mimetype: req.file.mimetype
                });
                try {
                    avatarUrl = yield (0, storage_1.uploadToGCS)(req.file);
                    console.log('File upload successful:', { avatarUrl });
                }
                catch (error) {
                    console.error('Avatar upload failed:', error);
                    logger_1.default.error('Avatar upload failed', {
                        userId,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    return res.status(500).json({ message: 'Failed to upload avatar' });
                }
            }
            else {
                console.log('No file uploaded, skipping avatar update');
                return res.status(400).json({ message: 'No file uploaded' });
            }
            if (name !== undefined) {
                console.log('Adding name update:', { name });
                updates.push((0, db_1.default) `"name" = ${name}`);
            }
            if (email !== undefined) {
                console.log('Adding email update:', { email });
                updates.push((0, db_1.default) `"email" = ${email}`);
            }
            if (description !== undefined) {
                console.log('Adding description update:', { description });
                updates.push((0, db_1.default) `"description" = ${description}`);
            }
            if (interests !== undefined) {
                console.log('Adding interests update:', { interests });
                updates.push((0, db_1.default) `"interests" = ${JSON.stringify(interests)}`);
            }
            if (isPublic !== undefined) {
                console.log('Adding isPublic update:', { isPublic });
                updates.push((0, db_1.default) `"ispublic" = ${isPublic}`);
            }
            if (avatarUrl !== undefined) {
                console.log('Adding avatar update:', { avatarUrl });
                updates.push((0, db_1.default) `"avatar" = ${avatarUrl}`);
            }
            // Always update updatedAt
            updates.push((0, db_1.default) `"updatedat" = NOW()`);
            if (updates.length === 0) {
                console.log('No fields to update');
                return res.status(400).json({ message: 'No fields to update' });
            }
            console.log('Preparing SQL update with fields:', { updateCount: updates.length });
            // Combine all updates with commas
            const updateClause = updates.reduce((acc, curr) => (0, db_1.default) `${acc}, ${curr}`);
            console.log('Executing database update');
            const result = yield (0, db_1.default) `
      UPDATE users
      SET ${updateClause}
      WHERE id = ${userId}
      RETURNING *
    `;
            // Invalidate user cache
            yield (0, redis_1.cacheDelete)(`user:${userId}`);
            yield (0, redis_1.cacheDelete)(`user:${userId}:profile`);
            // Publish profile update event
            yield kafka_1.kafkaService.publishEvent(kafka_1.KafkaTopics.USER_ACTIVITY, {
                type: 'profile_updated',
                userId,
                data: {
                    updatedFields: Object.keys(req.body),
                    hasAvatar: !!avatarUrl,
                    timestamp: new Date()
                }
            });
            // Notify connected clients
            (0, socket_1.getSocketService)().emitToUser(userId, 'profile:updated', {
                userId,
                updatedFields: Object.keys(req.body),
                hasAvatar: !!avatarUrl
            });
            logger_1.default.info('Profile updated successfully', {
                userId,
                updatedFields: Object.keys(req.body),
                hasAvatar: !!avatarUrl
            });
            // Return updated user data (excluding sensitive fields)
            const _c = result[0], { password } = _c, updatedUser = __rest(_c, ["password"]);
            console.log('Sending response with updated user data');
            res.json({
                message: 'Profile updated successfully',
                user: updatedUser
            });
        }
        catch (err) {
            console.error('Profile update failed:', err);
            logger_1.default.error('Profile update failed', {
                userId,
                error: err instanceof Error ? err.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Failed to update profile' });
        }
    });
}
function getPrivacySettings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = req.user.id;
            const user = yield (0, db_1.default) `
      SELECT connection_request_privacy, ispublic, isverified 
      FROM users 
      WHERE id = ${userId}
    `;
            if (user.length === 0) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.json({
                connection_request_privacy: user[0].connection_request_privacy,
                isPublic: user[0].ispublic,
                isVerified: user[0].isverified
            });
        }
        catch (error) {
            logger_1.default.error('Error fetching privacy settings:', {
                userId: req.user.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Failed to fetch privacy settings' });
        }
    });
}
function updatePrivacySettings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = req.user.id;
            const { connection_request_privacy } = req.body;
            // Validate privacy setting
            const validSettings = ['public', 'network_only', 'verified_only', 'none'];
            if (!validSettings.includes(connection_request_privacy)) {
                return res.status(400).json({
                    message: 'Invalid privacy setting. Must be one of: public, network_only, verified_only, none'
                });
            }
            yield (0, db_1.default) `
      UPDATE users 
      SET connection_request_privacy = ${connection_request_privacy}, 
          updatedat = NOW()
      WHERE id = ${userId}
    `;
            logger_1.default.info('Privacy settings updated', {
                userId,
                newSetting: connection_request_privacy
            });
            res.json({
                message: 'Privacy settings updated successfully',
                connection_request_privacy
            });
        }
        catch (error) {
            logger_1.default.error('Error updating privacy settings:', {
                userId: req.user.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(500).json({ message: 'Failed to update privacy settings' });
        }
    });
}
