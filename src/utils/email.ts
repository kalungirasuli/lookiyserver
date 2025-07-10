import nodemailer from 'nodemailer';
import logger from './logger';

export async function sendVerificationEmail(email: string, token: string) {
  // Use environment variables for SMTP config
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env as Record<string, string>;
  
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    logger.warn('Email configuration missing, falling back to console output', {
      email,
      token,
      missingVars: {
        SMTP_HOST: !SMTP_HOST,
        SMTP_PORT: !SMTP_PORT,
        SMTP_USER: !SMTP_USER,
        SMTP_PASS: !SMTP_PASS,
        EMAIL_FROM: !EMAIL_FROM
      }
    });
    // Fallback: log to console
    console.log(`[DEV] Send verification email to ${email} with token: ${token}`);
    return;
  }

  logger.info('Initializing email transport', { host: SMTP_HOST, port: SMTP_PORT });
  
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const verificationUrl = `http://localhost:3000/api/auth/verify-email?token=${token}`;
  
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify your Lookiy account',
      html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`
    });
    
    logger.info('Verification email sent successfully', { 
      to: email,
      from: EMAIL_FROM 
    });
  } catch (error) {
    logger.error('Failed to send verification email', {
      to: email,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}