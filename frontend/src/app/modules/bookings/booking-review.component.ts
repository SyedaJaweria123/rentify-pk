import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { BookingService } from './booking.service';
import { ReviewService } from '../reviews/review.service';
import { AuthService } from '../../services/auth.service';
import { WriteReviewComponent, ReviewSubmitData } from '../reviews/write-review.component';
import { StarRatingComponent } from '../../shared/components/star-rating.component';

/**
 * Booking Review — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * A dedicated, standalone page for leaving reviews after a delivery — linked
 * from the "Delivery Complete" email (both renter and owner get it) instead
 * of being buried in the booking detail page. Two independent sections:
 *   1. Review the other party (renter↔owner) — reuses WriteReviewComponent
 *   2. Rate the rider who delivered it — plain star + comment, both roles
 * Each section hides itself once submitted / already done, and the whole
 * page shows a "you're all caught up" state when nothing is left to review.
 */
@Component({
  selector: 'app-booking-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe, MatSnackBarModule, WriteReviewComponent, StarRatingComponent],
  templateUrl: './booking-review.component.html',
  styleUrls: ['./booking-review.component.css'],
})
export class BookingReviewComponent implements OnInit {
  bookingId = '';
  booking: any = null;
  loading = true;
  error = '';

  riderInfo: { id: string; name: string; avatar: string | null } | null = null;

  reviewSubmitted = false;
  riderReviewSubmitted = false;

  riderRatingValue = 0;
  riderCommentValue = '';
  riderReviewError = '';
  submittingRiderReview = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private bookingService: BookingService,
    private reviewService: ReviewService,
    public  auth: AuthService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.bookingId) { this.error = 'Invalid booking link.'; this.loading = false; return; }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error   = '';
    this.bookingService.getById(this.bookingId).subscribe({
      next: (res) => {
        this.booking = res.data.booking;
        this.reviewSubmitted     = this.isOwner ? !!this.booking.ownerReviewed       : !!this.booking.renterReviewed;
        this.riderReviewSubmitted = this.isOwner ? !!this.booking.ownerReviewedRider : !!this.booking.renterReviewedRider;
        this.loading = false;
        this.loadRiderInfo();
      },
      error: (err) => {
        this.error   = err.error?.message || 'This booking could not be found.';
        this.loading = false;
      },
    });
  }

  loadRiderInfo(): void {
    this.http.get<any>(`${environment.apiUrl}/bookings/${this.bookingId}/qr`).subscribe({
      next: (res) => { this.riderInfo = res?.data?.rider || null; },
      error: () => { this.riderInfo = null; },
    });
  }

  get isOwner(): boolean {
    if (!this.booking || !this.auth.currentUser) return false;
    const ownerId = this.booking.owner?._id || this.booking.owner?.id || this.booking.owner;
    return String(ownerId) === String(this.auth.currentUser.id);
  }

  get otherPartyLabel(): string { return this.isOwner ? 'Renter' : 'Owner'; }

  get otherPartyName(): string {
    const party = this.isOwner ? this.booking?.renter : this.booking?.owner;
    return party?.name || this.otherPartyLabel;
  }

  get listingTitle(): string { return this.booking?.listing?.title || 'this item'; }
  get listingImage(): string { return this.booking?.listing?.images?.[0]?.url || ''; }

  get canReview(): boolean {
    if (!this.booking) return false;
    if (!['completed', 'delivered', 'active'].includes(this.booking.status)) return false;
    return !this.reviewSubmitted;
  }

  get canReviewRider(): boolean {
    if (!this.booking || !this.riderInfo) return false;
    if (!['completed', 'delivered', 'active'].includes(this.booking.status)) return false;
    return !this.riderReviewSubmitted;
  }

  get allDone(): boolean {
    return !this.loading && !this.error && !this.canReview && !this.canReviewRider;
  }

  onReviewSubmitted(data: ReviewSubmitData): void {
    this.reviewService.create({
      bookingId:  this.bookingId,
      rating:     data.rating,
      comment:    data.comment,
      subRatings: data.subRatings,
    }).subscribe({
      next: () => { this.reviewSubmitted = true; this.snack.open('Review submitted — thank you!', 'Close', { duration: 3000 }); },
      error: (err) => { this.snack.open(err.error?.message || 'Failed to submit review', 'Close', { duration: 3500 }); },
    });
  }

  submitRiderReview(): void {
    this.riderReviewError = '';
    if (!this.riderRatingValue) { this.riderReviewError = 'Please select a rating.'; return; }
    if (this.riderCommentValue.trim().length < 10) { this.riderReviewError = 'Minimum 10 characters required.'; return; }

    this.submittingRiderReview = true;
    this.reviewService.reviewRider(this.bookingId, this.riderRatingValue, this.riderCommentValue.trim()).subscribe({
      next: () => {
        this.riderReviewSubmitted  = true;
        this.submittingRiderReview = false;
        this.snack.open('Rider review submitted — thank you!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.riderReviewError      = err.error?.message || 'Failed to submit rider review.';
        this.submittingRiderReview = false;
      },
    });
  }

  goToBooking(): void { this.router.navigate(['/bookings', this.bookingId]); }
}
