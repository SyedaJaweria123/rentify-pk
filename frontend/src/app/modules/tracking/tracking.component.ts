import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule }               from '@angular/common';
import { FormsModule }                from '@angular/forms';
import { ActivatedRoute, Router }     from '@angular/router';
import { HttpClient }                 from '@angular/common/http';
import { environment }                from '../../../environments/environment';
import { AuthService }                from '../../services/auth.service';
import { RiderLayoutComponent }       from '../rider/rider-layout.component';
import { RenterLayoutComponent }      from '../dashboard/renter-layout.component';

@Component({
  selector   : 'app-tracking',
  standalone : true,
  imports    : [CommonModule, FormsModule, RiderLayoutComponent, RenterLayoutComponent],
  templateUrl: './tracking.component.html',
  styleUrls  : ['./tracking.component.css'],
})
export class TrackingComponent implements OnInit, OnDestroy {

  get isRider(): boolean { return String(this.auth.currentUser?.role || '') === 'rider'; }

  trackingInput    = '';
  loading          = signal(false);
  error            = signal('');
  booking          = signal<any>(null);
  private refreshInterval: any = null;

  constructor(
    private http  : HttpClient,
    private route : ActivatedRoute,
    private router: Router,
    public  auth  : AuthService,
  ) {}

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  ngOnInit(): void {
    // URL se booking ID auto-fill: /track?id=xxx
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) { this.trackingInput = id; this.track(); }
  }

  track(): void {
    const id = this.trackingInput.trim();
    if (!id) { this.error.set('Booking ID enter karein.'); return; }

    this.loading.set(true);
    this.error.set('');
    this.booking.set(null);

    this.http.get<any>(`${environment.apiUrl}/bookings/${id}/tracking`).subscribe({
      next : (res) => {
        this.booking.set(res?.data?.booking || null);
        this.loading.set(false);
        // Active delivery pe har 30 sec mein auto-refresh
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        const status = res?.data?.booking?.status;
        if (status && !['completed', 'cancelled', 'rejected'].includes(status)) {
          this.refreshInterval = setInterval(() => this.silentRefresh(), 30000);
        }
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Booking nahi mili — ID check karein.');
        this.loading.set(false);
      },
    });
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  shortId(b: any): string {
    return (b._id || b.id || '').slice(-12).toUpperCase();
  }

  renterName(b: any): string {
    return b.renter?.name || b.renter || 'N/A';
  }

  listingTitle(b: any): string {
    return b.listing?.title || 'Item';
  }

  payStatusLabel(s: string): string {
    const map: Record<string, string> = {
      unpaid: 'Unpaid', partial_paid: 'Partially Paid', paid: 'Fully Paid',
      refunded: 'Refunded', partial_refund: 'Partial Refund',
    };
    return map[s] || 'Unpaid';
  }

  private silentRefresh(): void {
    const id = this.trackingInput.trim();
    if (!id) return;
    this.http.get<any>(`${environment.apiUrl}/bookings/${id}/tracking`).subscribe({
      next : (res) => {
        this.booking.set(res?.data?.booking || null);
        // Delivery complete ho gayi — refresh band karo
        const status = res?.data?.booking?.status;
        if (status && ['completed', 'cancelled', 'rejected'].includes(status)) {
          if (this.refreshInterval) { clearInterval(this.refreshInterval); this.refreshInterval = null; }
        }
      },
      error: () => {},
    });
  }

  statusText(s: string): string {
    const map: Record<string, string> = {
      pending    : 'Pending',
      confirmed  : 'Confirmed',
      in_delivery: 'In Delivery',
      delivered  : 'Delivered',
      active     : 'Active',
      completed  : 'Completed',
      cancelled  : 'Cancelled',
      rejected   : 'Rejected',
    };
    return map[s] || s;
  }

  statusDot(s: string): string {
    const map: Record<string, string> = {
      pending    : '🕐',
      confirmed  : '✅',
      in_delivery: '🛵',
      delivered  : '📦',
      active     : '✅',
      completed  : '🎉',
      cancelled  : '❌',
      rejected   : '❌',
    };
    return map[s] || '📋';
  }

  badgeClass(s: string): string {
    const map: Record<string, string> = {
      pending    : 'badge-pending',
      confirmed  : 'badge-confirmed',
      in_delivery: 'badge-delivery',
      delivered  : 'badge-delivered',
      active     : 'badge-active',
      completed  : 'badge-completed',
      cancelled  : 'badge-cancelled',
      rejected   : 'badge-cancelled',
    };
    return map[s] || 'badge-pending';
  }

  timeline(b: any): { title: string; time: string; done: boolean; current: boolean }[] {
    const fmt = (d: any): string => d
      ? new Date(d).toLocaleString('en-PK', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '';

    // Chronological order (oldest first) — sirf real timestamps use karo
    // done: true = ho chuka, done: false = abhi pending
    const allSteps = [
      {
        title  : 'Booking Requested',
        time   : fmt(b.createdAt),
        done   : !!b.createdAt,
        current: false,
      },
      {
        title  : 'Booking Confirmed by Owner',
        time   : fmt(b.confirmedAt),
        done   : !!b.confirmedAt,
        current: false,
      },
      {
        title  : 'Rider Assigned & Accepted',
        time   : fmt(b.riderAssignedAt || null),
        done   : ['in_delivery','delivered','completed'].includes(b.status),
        current: false,
      },
      {
        title  : 'Item Picked Up — In Delivery',
        time   : fmt(b.pickedUpAt),
        done   : !!b.pickedUpAt || ['delivered','completed'].includes(b.status),
        current: false,
      },
      {
        title  : 'Item Delivered to Renter',
        time   : fmt(b.deliveredAt),
        done   : !!b.deliveredAt,
        current: false,
      },
      {
        title  : 'Rental Completed',
        time   : fmt(b.completedAt),
        done   : !!b.completedAt,
        current: false,
      },
    ];

    // Jo steps ho chuke + current (pehla jo nahi hua) mark karo
    const firstPending = allSteps.findIndex(s => !s.done);
    if (firstPending !== -1) allSteps[firstPending].current = true;

    // Chronological order (Ordered → Delivered) — horizontal stepper ke liye sab steps
    return allSteps;
  }
}
