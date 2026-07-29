import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ListingService } from '../../services/listing.service';
import { ReviewService } from '../../modules/reviews/review.service';
import { Listing, PRICE_UNIT_LABELS } from '../../models/listing.model';
import { TrustBadgeComponent } from '../../shared/components/trust-badge/trust-badge.component';
import { StarRatingComponent } from '../../shared/components/star-rating.component';

interface PublicProfileUser {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
  cnicVerified: boolean;
  trustScore?: number;
  trustBadge?: 'none' | 'Bronze' | 'Silver' | 'Gold';
  memberSince: string;
  address: string | null;
}

interface PublicProfileStats {
  activeListings: number;
  completedRentals: number;
  avgRating: number;
  reviewCount: number;
}

@Component({
  selector: 'app-owner-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe, DecimalPipe, TrustBadgeComponent, StarRatingComponent],
  templateUrl: './owner-profile.component.html',
  styleUrls: ['./owner-profile.component.css'],
})
export class OwnerProfileComponent implements OnInit {
  ownerId = '';

  // ── Profile state ──────────────────────────────────────────────────────────
  profileLoading = true;
  profileError = '';
  user: PublicProfileUser | null = null;
  stats: PublicProfileStats | null = null;

  // ── Listings state ──────────────────────────────────────────────────────────
  listings: Listing[] = [];
  listingsLoading = true;
  listingsError = '';
  listingsPage = 1;
  listingsTotalPages = 1;
  listingsTotal = 0;

  // ── Reviews state ───────────────────────────────────────────────────────────
  reviews: any[] = [];
  reviewsLoading = true;
  reviewsError = '';
  reviewsPage = 1;
  reviewsTotalPages = 1;

  isLoggedIn = false;
  isSelf = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private listingService: ListingService,
    private reviewService: ReviewService,
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = this.authService.isLoggedIn;
    this.ownerId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.ownerId) {
      this.profileError = 'Invalid profile link.';
      this.profileLoading = false;
      return;
    }

    const me: any = this.authService.currentUser;
    this.isSelf = !!me && (me.id === this.ownerId || me._id === this.ownerId);

    this.loadProfile();
    this.loadListings(1);
    this.loadReviews(1);
  }

  // ── Profile header ──────────────────────────────────────────────────────────
  loadProfile(): void {
    this.profileLoading = true;
    this.profileError = '';
    this.authService.getPublicProfile(this.ownerId).subscribe({
      next: (res: any) => {
        this.user = res?.data?.user || null;
        this.stats = res?.data?.stats || null;
        this.profileLoading = false;
      },
      error: (err: any) => {
        this.profileError = err?.error?.message || 'This profile could not be found.';
        this.profileLoading = false;
      },
    });
  }

  // ── Listings grid ────────────────────────────────────────────────────────────
  loadListings(page: number): void {
    this.listingsLoading = true;
    this.listingsError = '';
    this.listingService.getByOwner(this.ownerId, page, 12).subscribe({
      next: (res: any) => {
        this.listings = res?.data?.listings || [];
        const pagination = res?.data?.pagination;
        this.listingsPage = pagination?.page || 1;
        this.listingsTotalPages = pagination?.totalPages || 1;
        this.listingsTotal = pagination?.total || 0;
        this.listingsLoading = false;
      },
      error: (err: any) => {
        this.listingsError = err?.error?.message || 'Could not load listings.';
        this.listingsLoading = false;
      },
    });
  }

  changeListingsPage(page: number): void {
    if (page < 1 || page > this.listingsTotalPages) return;
    this.loadListings(page);
  }

  // ── Reviews ──────────────────────────────────────────────────────────────────
  loadReviews(page: number): void {
    this.reviewsLoading = true;
    this.reviewsError = '';
    this.reviewService.getUserReviews(this.ownerId, 'renter_to_owner', page).subscribe({
      next: (res: any) => {
        this.reviews = res?.data?.reviews || [];
        const pagination = res?.data?.pagination;
        this.reviewsPage = pagination?.page || 1;
        this.reviewsTotalPages = pagination?.totalPages || 1;
        this.reviewsLoading = false;
      },
      error: (err: any) => {
        this.reviewsError = err?.error?.message || 'Could not load reviews.';
        this.reviewsLoading = false;
      },
    });
  }

  changeReviewsPage(page: number): void {
    if (page < 1 || page > this.reviewsTotalPages) return;
    this.loadReviews(page);
  }

  // ── Navigation / actions ─────────────────────────────────────────────────────
  goToListing(l: Listing): void {
    const id = l._id || l.id;
    this.router.navigate(['/listings', id]);
  }

  messageOwner(): void {
    if (!this.isLoggedIn) { this.router.navigate(['/auth/login']); return; }
    if (!this.ownerId) return;
    this.router.navigate(['/messages'], { queryParams: { userId: this.ownerId } });
  }

  goBack(): void {
    this.router.navigate(['/listings']);
  }

  retryProfile(): void { this.loadProfile(); }
  retryListings(): void { this.loadListings(this.listingsPage); }
  retryReviews(): void { this.loadReviews(this.reviewsPage); }

  // ── Display helpers ─────────────────────────────────────────────────────────
  get ownerInitial(): string {
    return this.user?.name ? this.user.name.charAt(0).toUpperCase() : '?';
  }

  getPriceUnitLabel(unit: string): string {
    return PRICE_UNIT_LABELS[unit as keyof typeof PRICE_UNIT_LABELS] || '';
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const ph = img.nextElementSibling as HTMLElement | null;
    if (ph) ph.style.display = 'flex';
  }
}
