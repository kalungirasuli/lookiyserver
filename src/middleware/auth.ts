import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/token';
import sql from '../utils/db';
import logger from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    sessionId: string;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded || !decoded.sessionId) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Verify session is still active
    const sessions = await sql`
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
    await sql`
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
  } catch (error) {
    logger.error('Authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(401).json({ message: 'Authentication failed' });
  }
}