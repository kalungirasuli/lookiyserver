import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('Google OAuth credentials are not configured. Google OAuth will be disabled. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment variables to enable Google OAuth.');
}

// Create OAuth2 client
let googleOAuth2Client: OAuth2Client | null = null;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  googleOAuth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

export { googleOAuth2Client };

// Generate Google OAuth URL
export const getGoogleAuthUrl = (): string => {
  if (!googleOAuth2Client) {
    throw new Error('Google OAuth is not configured');
  }

  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  return googleOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
};

// Verify Google ID token
export const verifyGoogleToken = async (idToken: string) => {
  if (!googleOAuth2Client) {
    throw new Error('Google OAuth is not configured');
  }

  try {
    const ticket = await googleOAuth2Client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified
    };
  } catch (error) {
    throw new Error(`Google token verification failed: ${error}`);
  }
};

// Exchange authorization code for tokens
export const exchangeCodeForTokens = async (code: string) => {
  if (!googleOAuth2Client) {
    throw new Error('Google OAuth is not configured');
  }

  try {
    const { tokens } = await googleOAuth2Client.getToken(code);
    googleOAuth2Client.setCredentials(tokens);
    
    if (!tokens.id_token) {
      throw new Error('No ID token received from Google');
    }

    return await verifyGoogleToken(tokens.id_token);
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }
};

export const googleOAuthConfig = {
  clientId: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  redirectUri: GOOGLE_REDIRECT_URI
};