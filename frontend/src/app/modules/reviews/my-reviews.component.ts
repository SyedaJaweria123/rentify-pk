import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ReviewService } from './review.service';
import { AuthService } from '../../services/auth.service';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';
import { RiderLayoutComponent } from '../rider/rider-layout.component';

/**
 * My Reviews (Renter) — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Every review the logged-in user has WRITTEN, using GET /reviews/my, plus
 * any owner response to that review (read-only here — only the owner can
 * respond, from their own Reviews page). Any role can rent and leave a
 * review, so this renders inside whichever sidebar matches the CURRENT
 * account's actual role (rider / owner / renter) rather than assuming
 * renter for everyone who isn't a rider — that previously showed the
 * Renter sidebar (with its hardcoded "Renter" label) even to owner accounts.
 * Renters/owners can delete their own review via DELETE /reviews/:id.
 */
@Component({
  selector: 'app-my-reviews',
  standalone: true,
  imports: [CommonModule, RouterModule, MatSnackBarModule, OwnerLayoutComponent, RenterLayoutComponent, RiderLayoutComponent],
  templateUrl: './my-reviews.component.html',
  styleUrls: ['./my-reviews.component.css'],
})
export class MyReviewsComponent implements OnInit {
  reviews: any[] = [];
  pagination: any = null;
  page = 1;
  loading = true;
  error = '';

  confirmDeleteId: string | null = null;
  deletingId: string | null = null;

  constructor(
    private reviewService: ReviewService,
    private auth: AuthService,
    private snack: MatSnackBar,
  ) {}

  get isRider(): boolean { return this.auth.currentUser?.role === 'rider'; }
  get isOwner(): boolean { return this.auth.isOwner; }

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.page    = page;
    this.loading = true;
    this.error   = '';
    this.reviewService.getMyReviews(page, 10).subscribe({
      next: (res: any) => {
        this.reviews    = res.data.reviews;
        this.pagination = res.data.pagination;
        this.loading    = false;
      },
      error: (err) => {
        this.error   = err.error?.message || 'Failed to load your reviews.';
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

  askDelete(id: string): void { this.confirmDeleteId = id; }
  cancelDelete(): void { this.confirmDeleteId = null; }

  confirmDelete(id: string): void {
    this.deletingId = id;
    this.reviewService.deleteReview(id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(r => r._id !== id);
        this.deletingId = null;
        this.confirmDeleteId = null;
        this.snack.open('Review deleted', 'Close', { duration: 2000 });
      },
      error: (err) => {
        this.deletingId = null;
        this.confirmDeleteId = null;
        this.snack.open(err.error?.message || 'Could not delete review.', 'Close', { duration: 3500 });
      },
    });
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
