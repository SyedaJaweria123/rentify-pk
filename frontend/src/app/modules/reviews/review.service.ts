import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export interface CreateReviewPayload {
  bookingId: string;
  rating: number;
  comment: string;
  subRatings?: {
    accuracy?: number;
    communication?: number;
    condition?: number;
    value?: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  constructor(private api: ApiService) {}

  create(payload: CreateReviewPayload): Observable<any> {
    return this.api.post('/reviews', payload);
  }

  getListingReviews(listingId: string, page = 1, limit = 10): Observable<any> {
    return this.api.get(`/reviews/listing/${listingId}`, { page, limit });
  }

  getUserReviews(userId: string, type?: string, page = 1): Observable<any> {
    return this.api.get(`/reviews/user/${userId}`, { type, page });
  }

  /** Reviews the logged-in renter has WRITTEN (as reviewer), with any owner response. */
  getMyReviews(page = 1, limit = 10): Observable<any> {
    return this.api.get('/reviews/my', { page, limit });
  }

  /** Renter rating the rider who delivered a specific booking (real avg-rating recalc server-side). */
  reviewRider(bookingId: string, rating: number, comment: string): Observable<any> {
    return this.api.post('/reviews/rider', { bookingId, rating, comment });
  }

  deleteReview(reviewId: string): Observable<any> {
    return this.api.delete(`/reviews/${reviewId}`);
  }

  respond(reviewId: string, comment: string): Observable<any> {
    return this.api.post(`/reviews/${reviewId}/respond`, { comment });
  }
}
