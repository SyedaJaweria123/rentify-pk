export interface SubRatings {
  accuracy?:      number;
  communication?: number;
  condition?:     number;
  value?:         number;
}

export interface OwnerResponse {
  comment: string;
  at:      string;
}

export interface Review {
  _id:           string;
  booking:       string;
  listing:       string;
  reviewer:      { _id: string; name: string; avatar?: string };
  reviewee:      { _id: string; name: string; avatar?: string };
  type:          'renter_to_owner' | 'owner_to_renter';
  rating:        number;
  subRatings?:   SubRatings;
  comment:       string;
  ownerResponse?: OwnerResponse;
  isModerated:   boolean;
  createdAt:     string;
}

export interface ReviewStats {
  avgRating:   number;
  totalReviews: number;
  distribution: Record<number, number>;
  subRatings?: {
    accuracy?:      number;
    communication?: number;
    condition?:     number;
    value?:         number;
  };
}

export interface CreateReviewDto {
  bookingId:   string;
  rating:      number;
  comment:     string;
  subRatings?: SubRatings;
}
