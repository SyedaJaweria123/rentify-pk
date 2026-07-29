import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReviewService } from './review.service';
import { AuthService } from '../../services/auth.service';

/**
 * Rider Reviews (received) — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Reviews renters have left for THIS rider's deliveries (type
 * 'renter_to_rider'), using the existing GET /reviews/user/:userId endpoint
 * — same one the owner Reviews page uses, just a different type filter.
 * Rendered inside RiderLayoutComponent via the /rider/reviews child route
 * (no self-wrap needed here, unlike the top-level pages).
 */
@Component({
  selector: 'app-rider-reviews',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rider-reviews.component.html',
  styleUrls: ['./rider-reviews.component.css'],
})
export class RiderReviewsComponent implements OnInit {
  reviews: any[] = [];
  stats: { avgRating: number; totalCount: number } = { avgRating: 0, totalCount: 0 };
  pagination: any = null;
  page = 1;
  loading = true;
  error = '';

  constructor(
    private reviewService: ReviewService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.load(1);
  }

  get myUserId(): string {
    return this.auth.currentUser?.id || '';
  }

  load(page: number): void {
    if (!this.myUserId) return;
    this.page    = page;
    this.loading = true;
    this.error   = '';
    this.reviewService.getUserReviews(this.myUserId, undefined, page).subscribe({
      next: (res: any) => {
        this.reviews    = res.data.reviews;
        this.stats      = res.data.stats;
        this.pagination = res.data.pagination;
        this.loading    = false;
      },
      error: (err) => {
        this.error   = err.error?.message || 'Failed to load reviews.';
        this.loading = false;
      },
    });
  }

  changePage(p: number): void {
    if (!this.pagination || p < 1 || p > this.pagination.totalPages) return;
    this.load(p);
  }

  starsArray(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating));
  }

  /** Some review comments were saved with HTML entities (e.g. &#x27; instead
   *  of '). Decode them for display — same fix used elsewhere in this module. */
  decodeComment(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/&#x27;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
}
