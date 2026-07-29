/**
 * Typed models for the Admin Dashboard.
 *
 * These shapes come from the admin stats + recent-activity endpoints.
 * Fields are marked optional where the backend may omit them or where the
 * frontend reads them defensively (e.g. `stats.totalUsers || 0`).
 */

/** KPI / stats object that feeds the dashboard cards and the doughnut chart. */
export interface DashboardStats {
  totalUsers: number;
  totalOwners: number;
  totalListings: number;
  totalBookings: number;
  activeBookings: number;
  pendingCNIC: number;
  pendingOwners: number;
  totalRevenue: number;

  // Growth percentages (period-over-period)
  userGrowth: number;
  bookingGrowth: number;
  revenueGrowth: number;
  listingGrowth: number;
}

/** Zero-filled default so the template never sees `undefined`. */
export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalUsers: 0, totalOwners: 0, totalListings: 0, totalBookings: 0,
  activeBookings: 0, pendingCNIC: 0, pendingOwners: 0, totalRevenue: 0,
  userGrowth: 0, bookingGrowth: 0, revenueGrowth: 0, listingGrowth: 0,
};

/** Minimal populated reference for a renter/owner on a booking. */
export interface PopulatedUserRef {
  _id?: string;
  name?: string;
  email?: string;
}

/** Minimal populated reference for a listing on a booking. */
export interface PopulatedListingRef {
  _id?: string;
  title?: string;
  category?: string;
}

/** Nested pricing block some bookings expose instead of a flat amount. */
export interface BookingPricing {
  totalAmount?: number;
}

/**
 * A recent booking row.
 *
 * The backend may return the populated party as `renter`/`listing` or as the
 * raw `renterId`/`listingId` reference, and the amount as `totalPrice`,
 * `totalAmount`, or nested under `pricing` — all are typed so the template can
 * read whichever is present without `any`.
 */
export interface RecentBooking {
  _id: string;
  status: string;
  createdAt: string;

  // Amount (any one of these may be present)
  totalPrice?: number;
  totalAmount?: number;
  pricing?: BookingPricing;

  // Populated party + listing (template uses `renter`/`listing`,
  // backend may also send `renterId`/`listingId`)
  renter?: PopulatedUserRef;
  listing?: PopulatedListingRef;
  renterId?: PopulatedUserRef;
  listingId?: PopulatedListingRef;
}

/** A recent user row in the activity table. */
export interface RecentUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  isEmailVerified?: boolean;
  cnicVerified?: boolean;
}
