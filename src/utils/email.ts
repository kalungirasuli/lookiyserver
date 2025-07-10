import nodemailer from 'nodemailer';

export async function sendVerificationEmail(email: string, token: string) {
  // Use environment variables for SMTP config
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env as Record<string, string>;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    // Fallback: log to console
    console.log(`[DEV] Send verification email to ${email} with token: ${token}`);
    return;
  }
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
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: 'Verify your Lookiy account',
    html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`
  });
}