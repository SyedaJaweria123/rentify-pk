import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { ReviewService } from './review.service';
import { StarRatingComponent } from '../../shared/components/star-rating.component';

@Component({
  selector: 'app-listing-reviews',
  standalone: true,
  imports: [
    CommonModule, DatePipe, FormsModule, ReactiveFormsModule,
    MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatDividerModule, MatIconModule,
    StarRatingComponent,
  ],
  template: `
    <section class="mt-8">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-gray-900">Reviews</h2>
        @if (stats()) {
          <div class="flex items-center gap-2">
            <app-star-rating [value]="stats()!.avgRating" [readonly]="true"></app-star-rating>
            <span class="font-bold text-gray-900">{{ stats()!.avgRating | number:'1.1-1' }}</span>
            <span class="text-gray-500 text-sm">({{ stats()!.totalCount }})</span>
          </div>
        }
      </div>

      <!-- Review Cards -->
      @if (loading()) {
        <div class="flex justify-center py-8"><mat-spinner diameter="32"></mat-spinner></div>
      }

      @for (review of reviews(); track review._id) {
        <div class="mb-5 pb-5 border-b border-gray-100 last:border-0">
          <div class="flex items-start gap-3">
            <!-- Avatar -->
            <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-indigo-100 flex items-center justify-center">
              @if (review.reviewer?.avatar) {
                <img [src]="review.reviewer.avatar" [alt]="review.reviewer.name" class="w-full h-full object-cover">
              } @else {
                <span class="text-indigo-700 font-bold">{{ review.reviewer?.name?.[0] | uppercase }}</span>
              }
            </div>

            <div class="flex-1">
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-gray-900">{{ review.reviewer?.name }}</span>
                <span class="text-xs text-gray-400">{{ review.createdAt | date:'mediumDate' }}</span>
              </div>

              <app-star-rating [value]="review.rating" [readonly]="true" [size]="'sm'"></app-star-rating>

              <p class="text-gray-700 mt-2 text-sm leading-relaxed">{{ decodeComment(review.comment) }}</p>

              <!-- Owner Response -->
              @if (review.ownerResponse?.comment) {
                <div class="mt-3 pl-4 border-l-2 border-indigo-200 bg-indigo-50 rounded-r-lg p-3">
                  <p class="text-xs font-semibold text-indigo-700 mb-1">Owner's Response</p>
                  <p class="text-sm text-gray-700">{{ decodeComment(review.ownerResponse.comment) }}</p>
                </div>
              }
            </div>
          </div>
        </div>
      }

      @if (!loading() && reviews().length === 0) {
        <div class="text-center py-8 text-gray-500">
          <div class="text-4xl mb-2">⭐</div>
          <p>No reviews yet. Be the first to review!</p>
        </div>
      }

      <!-- Pagination -->
      @if (pagination() && pagination().totalPages > 1) {
        <div class="flex justify-center mt-4">
          <button mat-stroked-button (click)="loadMore()" [disabled]="loading()">
            Load More Reviews
          </button>
        </div>
      }
    </section>
  `,
})
export class ListingReviewsComponent implements OnInit {
  @Input() listingId!: string;
  @Input() completedBookingId?: string; // If user can leave a review

  reviews    = signal<any[]>([]);
  stats      = signal<any | null>(null);
  pagination = signal<any>(null);
  loading    = signal(false);
  page = 1;

  constructor(
    private reviewSvc: ReviewService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.reviewSvc.getListingReviews(this.listingId, this.page).subscribe({
      next: (res) => {
        const cur = this.reviews();
        this.reviews.set(this.page === 1 ? res.data.reviews : [...cur, ...res.data.reviews]);
        this.stats.set(res.data.stats);
        this.pagination.set(res.data.pagination);
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('Failed to load reviews', 'Close', { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    this.page++;
    this.load();
  }

  /**
   * Defensive decode for review comments. Some old/imported test reviews in
   * the database were saved with literal HTML entities (e.g. "It&#x27;s")
   * instead of the actual character — this decodes common entities back to
   * normal text before display. New reviews submitted through the app are
   * never encoded in the first place, so this is purely a safety net for
   * legacy/imported data.
   */
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
