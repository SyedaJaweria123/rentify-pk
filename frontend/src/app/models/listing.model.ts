/**
 * Listing Models — Rentify PK
 * Shared TypeScript interfaces for listings module.
 */

export interface ListingImage {
  url:      string;
  publicId: string;
  width?:   number;
  height?:  number;
  format?:  string;
}

export type ListingStatus    = 'active' | 'inactive' | 'rented' | 'deleted';
export type ListingPriceUnit = 'per_day' | 'per_week' | 'per_month' | 'per_hour';

export const PRICE_UNIT_LABELS: Record<ListingPriceUnit, string> = {
  per_day:   '/ day',
  per_week:  '/ week',
  per_month: '/ month',
  per_hour:  '/ hour',
};

export const LISTING_CATEGORIES = [
  'Electronics',
  'Vehicles',
  'Furniture',
  'Tools & Equipment',
  'Sports & Outdoors',
  'Clothing & Accessories',
  'Books & Media',
  'Home Appliances',
  'Musical Instruments',
  'Photography & Video',
  'Party & Events',
  'Baby & Kids',
  'Gaming',
  'Travel & Luggage',
  'Other',
] as const;

export type ListingCategory = typeof LISTING_CATEGORIES[number];

export type ListingCondition = 'New' | 'Like New' | 'Used' | 'Heavily Used';
export const LISTING_CONDITIONS: ListingCondition[] = ['New', 'Like New', 'Used', 'Heavily Used'];

export const OWNER_CLAIMS = ['Well Maintained', 'Clean & Hygienic', 'On-time Delivery', 'Smoke-Free'] as const;
export type OwnerClaim = typeof OWNER_CLAIMS[number];

export interface ListingOwner {
  id?:            string;
  _id?:           string;
  name:           string;
  email:          string;
  avatar?:        string;
  role:           string;
  cnicVerified?:  boolean;
  createdAt?:     string;
  /* Extra fields populated by backend aggregation */
  rating?:        number;
  totalListings?: number;
  trustBadge?:    'none' | 'Bronze' | 'Silver' | 'Gold';
  trustScore?:    number;
}

/** Real owner summary stats returned alongside a listing — same sources as
 *  the owner public-profile endpoint, never fabricated placeholders. */
export interface OwnerStats {
  activeListings:   number;
  completedRentals: number;
  responseRate:     number; // 0-100, % of conversations replied to within 24h
}

export interface Listing {
  id?:          string;
  _id?:         string;
  title:        string;
  description:  string;
  category:     ListingCategory;
  price:        number;
  priceUnit:    ListingPriceUnit;
  securityDeposit?: number;
  condition?:     ListingCondition | null;
  brand?:         string | null;
  model?:         string | null;
  setupType?:     string | null;
  includedItems?: string[];
  ownerClaims?:   OwnerClaim[];
  images:       ListingImage[];
  coverImage?:  string | null;
  status:       ListingStatus;
  city?:        string;
  area?:        string;
  lat?:         number | null;
  lng?:         number | null;
  views:        number;
  bookings:     number;
  createdBy:    ListingOwner | string;
  createdAt:    string;
  updatedAt:    string;
  /* Optional fields — populated when reviews are aggregated */
  rating?:      number;
  reviewCount?: number;
}

export interface ListingPagination {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export interface ListingsResponse {
  listings:   Listing[];
  pagination: ListingPagination;
}

/* sortBy now includes 'rating' for the new sort option */
export interface ListingFilters {
  search?:   string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  city?:     string;
  sortBy?:   'createdAt' | 'price' | 'title' | 'views' | 'rating';
  order?:    'asc' | 'desc';
  status?:   string;
  page?:     number;
  limit?:    number;
}

export interface CategoryCount {
  name:  string;
  count: number;
}
