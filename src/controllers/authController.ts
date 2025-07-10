import { Request, Response } from 'express';
import sql from '../utils/db';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationEmail } from '../utils/email';

export async function register(req: Request, res: Response) {
  const { name, email, password, description, interests, isPublic } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const createdAt = new Date();
  const updatedAt = new Date();
  const isVerified = false;
  const avatar = null;
  try {
    await sql`INSERT INTO users (id, name, email, password, description, interests, avatar, isVerified, isPublic, createdAt, updatedAt) VALUES (${id}, ${name}, ${email}, ${hashedPassword}, ${description}, ${JSON.stringify(interests)}, ${avatar}, ${isVerified}, ${isPublic}, ${createdAt}, ${updatedAt})`;
    // Generate a fake verification token (in real app, use JWT or similar)
    const verificationToken = id;
    await sendVerificationEmail(email, verificationToken);
    res.status(201).json({ message: 'User registered. Please verify your email.' });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err });
  }
}

export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Missing token' });
  try {
    const result = await sql`UPDATE users SET isVerified = true WHERE id = ${token} RETURNING *`;
    if (result.count === 0) return res.status(400).json({ message: 'Invalid token' });
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed', error: err });
  }
}