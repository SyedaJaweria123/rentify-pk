import { Listing } from './listing.model';
import { User } from './auth.model';

export type BookingStatus =
  | 'pending' | 'confirmed' | 'active' | 'completed'
  | 'cancelled' | 'rejected' | 'disputed';

export type PaymentStatus = 'unpaid' | 'pending' | 'partial_paid' | 'paid' | 'refunded' | 'partial_refund';
export type DeliveryMethod = 'pickup' | 'delivery';

export interface BookingPricing {
  pricePerUnit: number;
  priceUnit:    string;
  subtotal:     number;
  serviceFee:   number;
  totalAmount:  number;
  deposit:      number;
}

export interface Cancellation {
  by:        string;
  at:        string;
  reason:    string;
}

export interface Booking {
  _id:            string;
  id?:            string;
  listing:        Listing | string;
  renter:         Partial<User> | string;
  owner:          Partial<User> | string;
  startDate:      string;
  endDate:        string;
  totalDays:      number;
  // Backend (toPublicJSON) returns these pricing fields at the TOP level:
  pricePerUnit?:  number;
  priceUnit?:     string;
  subtotal?:      number;
  serviceFee?:    number;
  totalAmount?:   number;
  depositAmount?: number;
  deliveryFee?:   number;
  // Trust-Tiered Payment: advance now, remainder on delivery (COD/wallet)
  advancePercent?:   number;
  advanceAmount?:    number;
  remainingAmount?:  number;
  remainingPaymentMethod?: 'cash' | 'wallet' | null;
  remainingCollectedAt?:   string | null;
  remainingRefused?:       boolean;
  deliveryDeadline?:       string | null;
  lateDeliveryStrike?:     boolean;
  // Kept optional for older shapes that nested pricing in an object:
  pricing?:       BookingPricing;
  status:         BookingStatus;
  paymentStatus:  PaymentStatus;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string | null;
  deliveryPhone?:   string | null;
  message?:       string;
  cancellation?:  Cancellation;
  renterReviewed: boolean;
  ownerReviewed:  boolean;
  renterReviewedRider?: boolean;
  ownerReviewedRider?: boolean;
  createdAt:      string;
  updatedAt:      string;
}

export interface BookingAvailability {
  available:  boolean;
  totalDays:  number;
  pricing:    BookingPricing;
}

export interface CreateBookingDto {
  listingId:      string;
  startDate:      string;
  endDate:        string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string | null;
  deliveryPhone?:   string | null;
  message?:       string;
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  active:    'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected:  'Rejected',
  disputed:  'Disputed',
};

export const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  active:    'bg-green-100 text-green-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-700',
  rejected:  'bg-red-100 text-red-800',
  disputed:  'bg-orange-100 text-orange-800',
};
