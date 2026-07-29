import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ReviewService } from './review.service';
import { AuthService } from '../../services/auth.service';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';

/**
 * Owner Reviews — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Reviews renters have left for this owner (type 'renter_to_owner'), using
 * the existing GET /reviews/user/:userId + PATCH /reviews/:id/respond
 * endpoints (ReviewService already had both). Real data only.
 */
@Component({
  selector: 'app-owner-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatSnackBarModule, OwnerLayoutComponent],
  templateUrl: './owner-reviews.component.html',
  styleUrls: ['./owner-reviews.component.css'],
})
export class OwnerReviewsComponent implements OnInit {
  reviews: any[] = [];
  stats: { avgRating: number; totalCount: number } = { avgRating: 0, totalCount: 0 };
  pagination: any = null;
  page = 1;
  loading = true;
  error = '';

  ratingFilter: number | null = null; // null = all, else 1-5
  readonly ratingFilters = [5, 4, 3, 2, 1];

  respondingId: string | null = null;
  responseDraft = '';
  submittingResponse = false;

  constructor(
    private reviewService: ReviewService,
    private auth: AuthService,
    private snack: MatSnackBar,
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
    this.reviewService.getUserReviews(this.myUserId, 'renter_to_owner', page).subscribe({
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

  get filteredReviews(): any[] {
    if (!this.ratingFilter) return this.reviews;
    return this.reviews.filter(r => Math.round(r.rating) === this.ratingFilter);
  }

  onRatingFilter(r: number | null): void {
    this.ratingFilter = this.ratingFilter === r ? null : r;
  }

  changePage(p: number): void {
    if (!this.pagination || p < 1 || p > this.pagination.totalPages) return;
    this.load(p);
  }

  starsArray(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating));
  }

  startResponse(review: any): void {
    this.respondingId = review._id;
    this.responseDraft = '';
  }

  cancelResponse(): void {
    this.respondingId = null;
    this.responseDraft = '';
  }

  submitResponse(review: any): void {
    const comment = this.responseDraft.trim();
    if (!comment) return;
    this.submittingResponse = true;
    this.reviewService.respond(review._id, comment).subscribe({
      next: () => {
        review.ownerResponse = { comment, at: new Date().toISOString() };
        this.submittingResponse = false;
        this.respondingId = null;
        this.snack.open('Response posted', 'Close', { duration: 2000 });
      },
      error: (err) => {
        this.submittingResponse = false;
        this.snack.open(err.error?.message || 'Could not post response.', 'Close', { duration: 3500 });
      },
    });
  }
}
