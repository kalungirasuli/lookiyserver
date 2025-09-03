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
  isverified: boolean;
  isPublic: boolean;
  connection_request_privacy: 'public' | 'network_only' | 'verified_only' | 'none';
  deletion_requested_at?: Date;
  account_status: 'active' | 'deleted' | 'pending_deletion';
}

export interface DeletedAccount extends BaseModel {
  user_id: string;
  deletion_requested_at: Date;
  permanent_deletion_date: Date;
  recovery_token: string;
  reason?: string;
  is_permanent: boolean;
  email?: string; // Added for join queries
}

export interface Network extends BaseModel {
  name: string;
  tag_name: string;
  description?: string;
  is_private: boolean;
  passcode?: string;
  approval_mode: 'manual' | 'passcode' | 'auto';
  avatar?: string;
  member_count?: number;  // Adding member count from SQL query
  suspension_status: 'active' | 'temporarily_suspended' | 'permanently_suspended';
  suspended_at?: Date;
  suspended_by?: string;
  suspension_token?: string;
  suspension_expires_at?: Date;
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
  network_id: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  responded_at?: Date;
}

export interface Connection extends BaseModel {
  user_id_1: string;
  user_id_2: string;
  network_id?: string;
  saved: boolean;
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

export interface NetworkInvitation extends BaseModel {
  network_id: string;
  invited_user_id: string;
  invited_by_id: string;
  role: 'admin' | 'leader' | 'vip' | 'moderator' | 'member';
  invite_token: string;
  is_used: boolean;
  expires_at: Date;
}

export interface NetworkGoal extends BaseModel {
  network_id: string;
  title: string;
  description?: string;
  created_by_id: string;
}

export interface UserNetworkGoal extends BaseModel {
  user_id: string;
  network_id: string;
  goal_id: string;
  selected_at: Date;
}

export interface PendingNetworkJoin extends BaseModel {
  network_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  passcode_attempt?: string;
}

export interface UserRecommendation extends BaseModel {
  user_id: string;
  recommended_user_id: string;
  network_id: string;
  match_score: number;
  is_served: boolean;
  served_at?: Date;
  is_acted_upon: boolean;
  acted_upon_at?: Date;
}

export interface RecommendationCache {
  user_id: string;
  network_id: string;
  recommendations: {
    user_id: string;
    match_score: number;
    cached_at: Date;
  }[];
  last_updated: Date;
}