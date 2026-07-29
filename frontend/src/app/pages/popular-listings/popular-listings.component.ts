import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { WishlistService } from '../../modules/wishlist/wishlist.service';
import { AuthService } from '../../services/auth.service';

/**
 * Popular Listings — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Real data from GET /api/listings/popular — ranked by actual completed
 * bookings (not just recency), with real per-listing average ratings
 * computed from the Review collection. No fake ratings or placeholder
 * items; a field (rating, trust badge) simply doesn't render if there's no
 * real data behind it yet. The heart/wishlist toggle is wired to the real
 * WishlistService, not decorative.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Component({
  selector: 'app-popular-listings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './popular-listings.component.html',
  styleUrls: ['./popular-listings.component.css'],
})
export class PopularListingsComponent implements OnInit {
  listings: any[] = [];
  loading = true;
  error = '';
  searchQuery = '';

  readonly trustPoints = [
    { icon: 'verified', title: 'Verified Items',   text: 'All listings are reviewed for quality and safety.' },
    { icon: 'secure',   title: 'Secure Payments',  text: 'Your payments are safe with our secure wallet.' },
    { icon: 'delivery', title: 'Fast Delivery',    text: 'Quick & reliable delivery to your doorstep.' },
    { icon: 'support',  title: '24/7 Support',     text: "We're here to help, anytime you need." },
    { icon: 'toprated', title: 'Top Rated',        text: 'Highly rated by real renters like you.' },
  ];

  constructor(
    private http: HttpClient,
    private router: Router,
    public  wishlist: WishlistService,
    public  auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.load();
    if (this.auth.isLoggedIn) {
      this.wishlist.getWishlist().subscribe({ error: () => {} });
    }
  }

  load(): void {
    this.loading = true;
    this.error   = '';
    this.http.get<any>(`${environment.apiUrl}/listings/popular?limit=24`).subscribe({
      next: (res) => {
        this.listings = res?.data?.listings || [];
        this.loading  = false;
      },
      error: (err) => {
        this.error   = err.error?.message || 'Failed to load popular listings.';
        this.loading = false;
      },
    });
  }

  openListing(id: string): void {
    this.router.navigate(['/listings', id]);
  }

  /** Real search over the actual loaded popular listings — matches title,
   *  category, or city (case-insensitive substring match). No fake results;
   *  if nothing matches, the empty state shows. */
  get filteredListings(): any[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.listings;
    return this.listings.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.city || '').toLowerCase().includes(q)
    );
  }

  clearSearch(): void { this.searchQuery = ''; }

  toggleWishlist(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn) { this.router.navigate(['/auth/login']); return; }
    this.wishlist.toggle(id).subscribe({ error: () => {} });
  }
}
