export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  description?: string;
  interests?: string[];
  avatar?: string;
  isVerified: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}