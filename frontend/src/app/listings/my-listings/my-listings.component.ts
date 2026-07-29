import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ListingService } from '../../services/listing.service';
import { Listing, PRICE_UNIT_LABELS } from '../../models/listing.model';
import { OwnerLayoutComponent } from '../../modules/dashboard/owner-layout.component';

/**
 * My Listings — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner's own inventory view — every listing they've created (any status),
 * from GET /listings/user/my. Real data only: no placeholder cards. Supports
 * status filter tabs, a client-side title search, activate/deactivate
 * toggling, and delete with a confirm step.
 */
@Component({
  selector: 'app-my-listings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatSnackBarModule, OwnerLayoutComponent],
  templateUrl: './my-listings.component.html',
  styleUrls: ['./my-listings.component.css'],
})
export class MyListingsComponent implements OnInit {
  listings: Listing[] = [];
  pagination: any = null;
  page = 1;
  loading = true;
  error = '';
  search = '';
  statusFilter: 'all' | 'active' | 'inactive' | 'rented' = 'all';

  togglingId: string | null = null;
  confirmDeleteId: string | null = null;
  deletingId: string | null = null;

  readonly statusTabs: { label: string; value: 'all' | 'active' | 'inactive' | 'rented' }[] = [
    { label: 'All',      value: 'all' },
    { label: 'Active',   value: 'active' },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Rented',   value: 'rented' },
  ];

  constructor(
    private listingService: ListingService,
    private router: Router,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.page    = page;
    this.loading = true;
    this.error   = '';
    this.listingService.getMyListings(page, 12, this.statusFilter).subscribe({
      next: (res) => {
        this.listings   = res.data.listings;
        this.pagination = res.data.pagination;
        this.loading    = false;
      },
      error: (err) => {
        this.error   = err.error?.message || 'Failed to load your listings.';
        this.loading = false;
      },
    });
  }

  onStatusFilter(v: 'all' | 'active' | 'inactive' | 'rented'): void {
    this.statusFilter = v;
    this.load(1);
  }

  get filteredListings(): Listing[] {
    if (!this.search.trim()) return this.listings;
    const q = this.search.toLowerCase();
    return this.listings.filter(l => (l.title || '').toLowerCase().includes(q) || (l.category || '').toLowerCase().includes(q));
  }

  changePage(p: number): void {
    if (!this.pagination || p < 1 || p > this.pagination.totalPages) return;
    this.load(p);
  }

  priceUnitLabel(unit: string): string {
    return PRICE_UNIT_LABELS[unit as keyof typeof PRICE_UNIT_LABELS] || '';
  }

  coverImage(l: Listing): string {
    return l.images?.[0]?.url || '';
  }

  id(l: Listing): string {
    return this.listingService.getListingId(l);
  }

  viewListing(l: Listing): void { this.router.navigate(['/listings', this.id(l)]); }
  editListing(l: Listing): void { this.router.navigate(['/listings/edit', this.id(l)]); }

  // ── Activate / deactivate toggle ────────────────────────────────────────────
  toggleActive(l: Listing, event: Event): void {
    event.stopPropagation();
    if (l.status !== 'active' && l.status !== 'inactive') return; // don't touch rented/deleted
    const id = this.id(l);
    this.togglingId = id;
    const nextStatus = l.status === 'active' ? 'inactive' : 'active';
    const fd = new FormData();
    fd.append('status', nextStatus);
    this.listingService.updateListing(id, fd).subscribe({
      next: () => {
        l.status = nextStatus as any;
        this.togglingId = null;
        this.snack.open(nextStatus === 'active' ? 'Listing activated' : 'Listing deactivated', 'Close', { duration: 2000 });
      },
      error: (err) => {
        this.togglingId = null;
        console.error('[toggleActive] failed:', err);
        this.snack.open(err.error?.message || 'Could not update the listing status.', 'Close', { duration: 3500 });
      },
    });
  }

  // ── Delete (with confirm step) ──────────────────────────────────────────────
  askDelete(l: Listing, event: Event): void {
    event.stopPropagation();
    this.confirmDeleteId = this.id(l);
  }

  cancelDelete(event?: Event): void {
    event?.stopPropagation();
    this.confirmDeleteId = null;
  }

  confirmDelete(l: Listing, event: Event): void {
    event.stopPropagation();
    const id = this.id(l);
    this.deletingId = id;
    this.listingService.deleteListing(id).subscribe({
      next: () => {
        this.listings = this.listings.filter(x => this.id(x) !== id);
        this.deletingId = null;
        this.confirmDeleteId = null;
        this.snack.open('Listing deleted', 'Close', { duration: 2000 });
      },
      error: (err) => {
        this.deletingId = null;
        this.confirmDeleteId = null;
        console.error('[confirmDelete] failed:', err);
        this.snack.open(err.error?.message || 'Could not delete the listing.', 'Close', { duration: 3500 });
      },
    });
  }

  addNewItem(): void { this.router.navigate(['/listings/add']); }
}
