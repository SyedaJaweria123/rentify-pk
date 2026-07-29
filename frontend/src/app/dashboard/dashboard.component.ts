import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService }    from '../services/auth.service';
import { ListingService } from '../services/listing.service';
import { User }           from '../models/auth.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {
  user:    User | null = null;
  history: any[]       = [];
  activeTab            = 'overview';
  showLogoutModal      = false;

  // ── Listing stats ──────────────────────────────────────────────────────────
  activeListingsCount = 0;
  totalListingsCount  = 0;
  myListings: any[]   = [];
  listingsLoading     = false;

  constructor(
    private auth:    AuthService,
    private listing: ListingService,
    private router:  Router,
  ) {}

  get isOwner(): boolean { return this.user?.role === 'owner'; }

  get userFirstLetter(): string {
    return this.user?.name?.charAt(0)?.toUpperCase() || '?';
  }

  get providerIcon(): string {
    const p = this.user?.provider;
    if (p === 'google')   return '🔵';
    if (p === 'facebook') return '📘';
    return '🔑';
  }

  get providerLabel(): string {
    const p = this.user?.provider;
    if (p === 'google')   return 'Google Account';
    if (p === 'facebook') return 'Facebook Account';
    return 'Email & Password';
  }

  get emailVerifiedLabel(): string { return this.user?.isEmailVerified ? 'Verified' : 'Not Verified'; }
  get cnicVerifiedLabel():  string { return this.user?.cnicVerified    ? 'Verified' : 'Pending Review'; }
  get cnicBadgeLabel():     string { return this.user?.cnicVerified    ? 'Verified' : 'Pending'; }
  get memberSince(): Date   { return new Date((this.user as any)?.createdAt || Date.now()); }

  ngOnInit(): void {
    this.user = this.auth.currentUser;
    this.auth.getMe().subscribe({ next: (res) => { if (res.success) this.user = res.data.user; } });
    this.auth.getLoginHistory().subscribe({ next: (res) => { if (res.success) this.history = res.data?.history || []; } });
    this.loadListingStats();
  }

  // ── Load user's own listing counts for the dashboard stats ─────────────────
  loadListingStats(): void {
    this.listingsLoading = true;
    this.listing.getMyListings(1, 5, 'all').subscribe({
      next: (res) => {
        const all          = res.data.listings || [];
        this.myListings    = all.slice(0, 3);
        this.totalListingsCount  = res.data.pagination.total;
        this.activeListingsCount = all.filter((l: any) => l.status === 'active').length;
        this.listingsLoading = false;
      },
      error: () => { this.listingsLoading = false; },
    });
  }

  // ── Quick action navigation ────────────────────────────────────────────────
  navigate(path: string): void { this.router.navigate([path]); }

  viewListing(id: string): void { this.router.navigate(['/listings', id]); }

  confirmLogout(): void { this.showLogoutModal = false; this.auth.logout(); }

  formatPermission(p: string): string {
    return p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
