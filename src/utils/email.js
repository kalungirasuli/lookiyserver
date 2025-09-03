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
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendLoginAlertEmail = sendLoginAlertEmail;
exports.sendAccountSuspensionEmail = sendAccountSuspensionEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendAccountDeletionEmail = sendAccountDeletionEmail;
exports.sendAccountRecoveredEmail = sendAccountRecoveredEmail;
exports.sendPermanentDeletionEmail = sendPermanentDeletionEmail;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const logger_1 = __importDefault(require("./logger"));
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@lookiy.com';
if (!SENDGRID_API_KEY) {
    logger_1.default.warn('SendGrid API key not found in environment variables');
}
else {
    mail_1.default.setApiKey(SENDGRID_API_KEY);
}
function sendVerificationEmail(email, token) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!SENDGRID_API_KEY) {
            logger_1.default.info('[DEV] Send verification email', { email, token });
            return;
        }
        const verificationUrl = `http://localhost:3000/api/auth/verify-email?token=${token}`;
        try {
            yield mail_1.default.send({
                to: email,
                from: FROM_EMAIL,
                subject: 'Verify your Lookiy account',
                html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`
            });
            logger_1.default.info('Verification email sent successfully', { to: email, token });
        }
        catch (error) {
            logger_1.default.error('Failed to send verification email', {
                to: email,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    });
}
function sendLoginAlertEmail(email, deviceInfo, ipAddress, sessionId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (!SENDGRID_API_KEY) {
            logger_1.default.info('[DEV] Send login alert email', { email, deviceInfo, ipAddress });
            return;
        }
        const deviceDetails = [
            ((_a = deviceInfo.browser) === null || _a === void 0 ? void 0 : _a.name) && `Browser: ${deviceInfo.browser.name} ${deviceInfo.browser.version || ''}`,
            ((_b = deviceInfo.os) === null || _b === void 0 ? void 0 : _b.name) && `OS: ${deviceInfo.os.name} ${deviceInfo.os.version || ''}`,
            ((_c = deviceInfo.device) === null || _c === void 0 ? void 0 : _c.model) && `Device: ${deviceInfo.device.model}`,
            `IP Address: ${ipAddress}`
        ].filter(Boolean).join('<br>');
        const approveUrl = `http://localhost:3000/api/auth/verify-login?token=${sessionId}&userId=${userId}&action=true`;
        const rejectUrl = `http://localhost:3000/api/auth/verify-login?token=${sessionId}&userId=${userId}&action=false`;
        try {
            yield mail_1.default.send({
                to: email,
                from: FROM_EMAIL,
                subject: 'New Login Detected - Action Required',
                html: `
        <h2>New Login Detected</h2>
        <p>We detected a login from a new device:</p>
        <div style="margin: 20px 0; padding: 10px; background: #f5f5f5;">
          ${deviceDetails}
        </div>
        <p>If this was you, please approve this device:</p>
        <p><a href="${approveUrl}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Approve Device</a></p>
        <p>If you don't recognize this login:</p>
        <p><a href="${rejectUrl}" style="background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Block Device & Suspend Session</a></p>
        <p>If you didn't initiate this login, we recommend changing your password immediately.</p>
      `
            });
            logger_1.default.info('Login alert email sent successfully', { to: email });
        }
        catch (error) {
            logger_1.default.error('Failed to send login alert email', {
                to: email,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    });
}
function sendAccountSuspensionEmail(email, reason, expiresAt) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!SENDGRID_API_KEY) {
            logger_1.default.info('[DEV] Send account suspension email', { email, reason, expiresAt });
            return;
        }
        const formattedExpiry = expiresAt.toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'long'
        });
        try {
            yield mail_1.default.send({
                to: email,
                from: FROM_EMAIL,
                subject: 'Account Temporarily Suspended - Security Alert',
                html: `
        <h2>Account Suspension Notice</h2>
        <p>Your account has been temporarily suspended due to security concerns:</p>
        <div style="margin: 20px 0; padding: 10px; background: #f5f5f5;">
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>Suspension Expires:</strong> ${formattedExpiry}</p>
        </div>
        <p>For your security, all active sessions have been terminated. You will be able to log in again after the suspension period.</p>
        <p>If you believe this is a mistake or if you need immediate assistance, please contact our support team.</p>
        <p>We recommend reviewing your account security settings and enabling two-factor authentication when you regain access.</p>
      `
            });
            logger_1.default.info('Account suspension email sent successfully', { to: email });
        }
        catch (error) {
            logger_1.default.error('Failed to send account suspension email', {
                to: email,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    });
}
function sendPasswordResetEmail(email, resetToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        return mail_1.default.send({
            to: email,
            from: FROM_EMAIL,
            subject: 'Password Reset Request',
            html: `
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <p><a href="${resetLink}">Reset Password</a></p>
      <p>This link will expire in 5 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
        });
    });
}
function sendAccountDeletionEmail(email, recoveryToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const recoveryLink = `${process.env.FRONTEND_URL}/recover-account?token=${recoveryToken}`;
        return mail_1.default.send({
            to: email,
            from: FROM_EMAIL,
            subject: 'Account Deletion Requested',
            html: `
      <h2>Account Deletion Request Received</h2>
      <p>Your account will be permanently deleted in 28 days. During this period, you can recover your account using the link below:</p>
      <p><a href="${recoveryLink}" style="background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Recover Account</a></p>
      <p>If you do not recover your account within 28 days, all your data will be permanently flagged as deleted but retained for recordkeeping purposes.</p>
      <p>If you did not request this deletion, please recover your account immediately and change your password.</p>
    `
        });
    });
}
function sendAccountRecoveredEmail(email) {
    return __awaiter(this, void 0, void 0, function* () {
        return mail_1.default.send({
            to: email,
            from: FROM_EMAIL,
            subject: 'Account Recovered Successfully',
            html: `
      <h2>Account Recovery Successful</h2>
      <p>Your account has been successfully recovered and is now active again.</p>
      <p>If you did not initiate this recovery, please contact our support team immediately.</p>
    `
        });
    });
}
function sendPermanentDeletionEmail(email) {
    return __awaiter(this, void 0, void 0, function* () {
        return mail_1.default.send({
            to: email,
            from: FROM_EMAIL,
            subject: 'Account Permanently Deleted',
            html: `
      <h2>Account Permanently Deleted</h2>
      <p>Your account has been permanently deleted as per your request.</p>
      <p>While your personal identifiers have been removed, some data may be retained for recordkeeping purposes.</p>
      <p>Thank you for having been part of our community.</p>
    `
        });
    });
}
