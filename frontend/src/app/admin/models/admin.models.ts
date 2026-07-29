// src/app/admin/models/admin.models.ts

export type AdminRole = 'super_admin' | 'admin' | 'manager' | 'support';

export interface AdminUser {
  _id:         string;
  name:        string;
  email:       string;
  phone?:      string;
  role:        string;
  avatar?:     string;
  isActive:    boolean;
  isEmailVerified: boolean;
  isSuspended: boolean;
  cnicVerified: boolean;
  ownerApproved?: boolean;
  walletBalance: number;
  createdAt:   string;
  lastLoginAt?: string;
}

export interface AdminListing {
  _id:       string;
  title:     string;
  category:  string;
  price:     number;
  priceUnit: string;
  status:    string;
  city?:     string;
  area?:     string;
  views:     number;
  bookings:  number;
  images:    { url: string }[];
  createdBy: { _id: string; name: string; email: string };
  createdAt: string;
}

export interface AdminBooking {
  _id:       string;
  listing:   { title: string; images: { url: string }[] };
  renter:    { name: string; email: string };
  owner:     { name: string; email: string };
  startDate: string;
  endDate:   string;
  totalDays: number;
  status:    string;
  pricing:   { totalAmount: number; serviceFee: number };
  createdAt: string;
}

export interface AdminTransaction {
  _id:         string;
  user:        { name: string; email: string };
  type:        string;
  amount:      number;
  balance:     number;
  status:      string;
  description: string;
  createdAt:   string;
}

export interface DashboardStats {
  totalUsers:    number;
  totalOwners:   number;
  totalListings: number;
  totalBookings: number;
  totalRevenue:  number;
  pendingCNIC:   number;
  pendingOwners: number;
  activeBookings: number;
  userGrowth:    number;
  revenueGrowth: number;
  bookingGrowth: number;
  listingGrowth: number;
}

export interface ChartData {
  labels:   string[];
  datasets: { label: string; data: number[]; color?: string }[];
}

export interface PaginatedResponse<T> {
  data:       T[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ActivityLog {
  _id:       string;
  action:    string;
  entity:    string;
  entityId:  string;
  user:      string;
  details:   string;
  ip?:       string;
  createdAt: string;
}
