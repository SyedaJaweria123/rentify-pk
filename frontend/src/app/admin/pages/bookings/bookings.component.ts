// src/app/admin/pages/bookings/bookings.component.ts
/**
 * Admin · Bookings Management — Rentify PK
 *  • Table: ID | Item | Renter | Owner | Dates | Amount | Status | Actions
 *  • Filter by status + client-side date-range filter
 *  • Actions: Force Complete, Cancel  (via PUT /api/admin/bookings/:id/status)
 *  • Row click → detail modal
 *  APIs: GET /api/admin/bookings, PUT /api/admin/bookings/:id/status
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  templateUrl: './bookings.component.html',
  styleUrls: ['./bookings.component.css'],
})
export class AdminBookingsComponent implements OnInit {
  bookings = signal<any[]>([]);
  loading  = signal(true);
  error    = signal('');

  status = '';
  fromDate = '';
  toDate = '';
  page = 1;
  limit = 10;
  total = signal(0);
  totalPages = signal(1);

  readonly statuses = ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'disputed'];

  showModal = signal(false);
  modalBooking = signal<any>(null);

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminSvc.getBookings({ page: this.page, limit: this.limit, status: this.status }).subscribe({
      next: (res) => {
        const d = res.data || {};
        let rows = d.bookings || [];
        // Client-side date-range filter on startDate
        if (this.fromDate) rows = rows.filter((b: any) => new Date(b.startDate) >= new Date(this.fromDate));
        if (this.toDate)   rows = rows.filter((b: any) => new Date(b.startDate) <= new Date(this.toDate));
        this.bookings.set(rows);
        this.total.set(d.pagination?.total || 0);
        this.totalPages.set(d.pagination?.totalPages || 1);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load bookings.'); this.loading.set(false); },
    });
  }

  onFilterChange(): void { this.page = 1; this.load(); }
  prevPage(): void { if (this.page > 1) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages()) { this.page++; this.load(); } }

  shortId(b: any): string { return '#' + String(b._id || '').slice(-6).toUpperCase(); }
  itemTitle(b: any): string { return b.listing?.title || 'Item'; }
  renterName(b: any): string { return b.renter?.name || '—'; }
  ownerName(b: any): string { return b.owner?.name || '—'; }
  amount(b: any): number { return b.totalAmount || b.pricing?.totalAmount || 0; }

  forceComplete(b: any, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Force-complete booking ${this.shortId(b)}?`)) return;
    this.adminSvc.updateBookingStatus(b._id, 'completed').subscribe({
      next: () => { b.status = 'completed'; },
      error: (e: any) => alert(e?.error?.message || 'Failed to complete booking.'),
    });
  }

  cancelBooking(b: any, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Cancel booking ${this.shortId(b)}?`)) return;
    this.adminSvc.updateBookingStatus(b._id, 'cancelled').subscribe({
      next: () => { b.status = 'cancelled'; },
      error: (e: any) => alert(e?.error?.message || 'Failed to cancel booking.'),
    });
  }

  openDetail(b: any): void { this.modalBooking.set(b); this.showModal.set(true); }
  closeModal(): void { this.showModal.set(false); }
}
