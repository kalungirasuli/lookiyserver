export interface BaseModel {
  id: string;
  created_at: Date;
  updated_at?: Date;
}

export interface User extends BaseModel {
  name: string;
  email: string;
  password: string;
  description?: string;
  interests?: string[];
  avatar?: string;
  isVerified: boolean;
  isPublic: boolean;
}

export interface Network extends BaseModel {
  name: string;
  tag_name: string;
  description?: string;
  is_private: boolean;
  passcode?: string;
}

export interface NetworkMember extends BaseModel {
  network_id: string;
  user_id: string;
  role: 'admin' | 'leader' | 'vip' | 'moderator' | 'member';
  joined_at: Date;
}

export interface ConnectionRequest extends BaseModel {
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Connection extends BaseModel {
  user_id_1: string;
  user_id_2: string;
  connected_at: Date;
}

export interface Post extends BaseModel {
  network_id: string;
  user_id: string;
  content: string;
  tags?: Record<string, any>;
}

export interface Comment extends BaseModel {
  post_id: string;
  user_id: string;
  content: string;
}

export interface Message extends BaseModel {
  from_user_id: string;
  to_user_id: string;
  content: string;
  is_read: boolean;
}

export interface BlockedConnection extends BaseModel {
  blocker_id: string;
  blocked_id: string;
}

export interface UserSession extends BaseModel {
  user_id: string;
  device_id: string;
  device_info: Record<string, any>;
  ip_address: string;
  is_active: boolean;
  last_active: Date;
  expires_at: Date;
}

export interface LoginAttempt extends BaseModel {
  user_id: string;
  ip_address: string;
  attempted_at: Date;
  is_successful: boolean;
}

export interface AccountSuspension extends BaseModel {
  user_id: string;
  reason: string;
  suspended_at: Date;
  expires_at: Date;
}