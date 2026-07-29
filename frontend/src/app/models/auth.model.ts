export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  role: 'renter' | 'owner' | 'rider';
  avatar?: string;
  provider?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  isSuspended?: boolean;
  cnicVerified?: boolean;
  ownerApproved?: boolean;
  permissions?: string[];
  walletBalance: number;
  linkedRiderAccountId?:   string | null;
  linkedPrimaryAccountId?: string | null;
  lastLoginAt?: string;
  loginHistory?: LoginRecord[];
  createdAt: string;
  // Owner-only — present when role === 'owner'
  trustScore?: number;
  trustBadge?: 'none' | 'Bronze' | 'Silver' | 'Gold';
  // Rider-only — present when role === 'rider'
  isAvailable?: boolean;
  riderRating?: number;
  vehicleType?: 'bike' | 'car' | 'van' | 'bicycle' | 'foot';
}

export interface LoginRecord {
  ip: string;
  browser: string;
  os: string;
  device: string;
  status: 'success' | 'failed';
  at: string;
}

export const TOKEN_KEY   = 'ra_token';
export const REFRESH_KEY = 'ra_refresh';
export const USER_KEY    = 'ra_user';
