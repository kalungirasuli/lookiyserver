export interface DeviceInfo {
  browser?: {
    name?: string;
    version?: string;
  };
  os?: {
    name?: string;
    version?: string;
  };
  device?: {
    type?: string;
    model?: string;
  };
}

export interface LoginResponse extends AuthResponse {
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    isVerified: boolean;
  };
}

export interface AuthResponse {
  message: string;
  error?: unknown;
}