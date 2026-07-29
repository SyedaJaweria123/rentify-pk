import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NotificationService, AppNotification } from './notification.service';
import { AuthService } from '../../services/auth.service';
import { RiderLayoutComponent } from '../rider/rider-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';

/**
 * Notification Detail — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * A Gmail-style "open the item, see the full detail" view. The list/bell
 * dropdown no longer jump straight to the related booking/payment/tracking
 * page on click — they open this page first (marking the notification read
 * and showing its full title/body/time), and this page offers a single
 * clear action button that goes to the right place for that notification's
 * type. `NotificationService.selected` carries the object over instantly
 * when navigating from the list; a direct link / refresh falls back to
 * `getById`, which searches the recent-notifications list client-side since
 * there's no dedicated single-item backend route.
 */
@Component({
  selector: 'app-notification-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, RiderLayoutComponent, RenterLayoutComponent],
  templateUrl: './notification-detail.component.html',
  styleUrls: ['./notification-detail.component.css'],
})
export class NotificationDetailComponent implements OnInit {
  get isRider(): boolean { return String(this.auth.currentUser?.role || '') === 'rider'; }

  notif: AppNotification | null = null;
  loading = true;
  notFound = false;

  constructor(
    private route:    ActivatedRoute,
    private router:   Router,
    private notifSvc: NotificationService,
    public  auth:     AuthService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    const handed = this.notifSvc.selected();

    if (handed && handed._id === id) {
      this.notif   = handed;
      this.loading = false;
      this.markReadIfNeeded();
      return;
    }

    this.notifSvc.getById(id).subscribe({
      next: (n) => {
        this.notif   = n || null;
        this.notFound = !n;
        this.loading  = false;
        this.markReadIfNeeded();
      },
      error: () => { this.loading = false; this.notFound = true; },
    });
  }

  private markReadIfNeeded(): void {
    if (this.notif && !this.notif.isRead) {
      this.notifSvc.markRead(this.notif._id).subscribe(() => {
        if (this.notif) this.notif.isRead = true;
      });
    }
  }

  goBack(): void { this.router.navigate(['/notifications']); }

  deleteNotif(): void {
    if (!this.notif) return;
    this.notifSvc.delete(this.notif._id).subscribe(() => this.goBack());
  }

  // ── Icon classification (same rules as the list page / bell dropdown) ─────
  get iconKey(): string {
    if (!this.notif) return 'bell';
    const t  = (this.notif.type  || '').toLowerCase();
    const ti = (this.notif.title || '').toLowerCase();
    if (ti.includes('rider'))                                     return 'rider';
    if (ti.includes('damage') || ti.includes('claim'))             return 'claim';
    if (ti.includes('picked up') || ti.includes('delivered') || ti.includes('delivery') || ti.includes('inspection')) return 'delivery';
    if (t === 'support')                                           return 'support';
    if (t.startsWith('booking') || ti.includes('booking'))         return 'booking';
    if (t.startsWith('payment') || t === 'withdrawal_processed' || ti.includes('payment') || ti.includes('refund') || ti.includes('payout') || ti.includes('deposit')) return 'payment';
    if (t.includes('review') || ti.includes('review'))             return 'star';
    if (t.includes('message'))                                     return 'message';
    if (t.includes('dispute') || ti.includes('dispute'))           return 'alert';
    if (t.includes('cnic'))                                        return 'shield';
    if (t.includes('listing') || ti.includes('listing'))           return 'box';
    return 'bell';
  }

  get iconTone(): string {
    switch (this.iconKey) {
      case 'rider':    return 'tone-rider';
      case 'delivery': return 'tone-delivery';
      case 'claim':    return 'tone-claim';
      case 'booking':  return 'tone-booking';
      case 'payment':  return 'tone-payment';
      case 'star':     return 'tone-message';
      case 'message':  return 'tone-message';
      case 'support':  return 'tone-support';
      case 'alert':    return 'tone-alert';
      case 'shield':   return 'tone-shield';
      case 'box':      return 'tone-box';
      default:         return 'tone-system';
    }
  }

  /** Label + icon-key for the primary action button, or null if there's
   *  nowhere else to go (a plain informational notification). */
  get action(): { label: string; icon: string } | null {
    if (!this.notif) return null;
    const m: any = this.notif.meta || {};
    const type   = this.notif.type || '';
    const title  = (this.notif.title || '').toLowerCase();

    if (m.ticketId && type === 'support') return { label: 'View Support Ticket', icon: 'support' };
    if (m.link)                            return { label: 'View Details', icon: 'arrow' };
    if (m.bookingId) {
      if (title.includes('inspection')) {
        return { label: 'View Report', icon: 'arrow' };
      }
      if (title.includes('rider') || title.includes('picked up') || title.includes('delivered')
          || title.includes('delivery completed')) {
        return { label: 'Track Delivery', icon: 'track' };
      }
      if (title.includes('payment') || title.includes('paid') || title.includes('refund')) {
        return { label: 'View Payment Status', icon: 'payment' };
      }
      return { label: 'View Booking', icon: 'booking' };
    }
    if (type.includes('message'))          return { label: 'Open Conversation', icon: 'message' };
    if (m.listingId) {
      const body = (this.notif.body || '').toLowerCase();
      const wasRemoved = title.includes('removed') || title.includes('deleted')
        || body.includes('has been removed') || body.includes('has been deleted');
      return wasRemoved ? null : { label: 'View Listing', icon: 'box' };
    }
    if (type.includes('cnic'))             return { label: 'Verify CNIC', icon: 'shield' };
    if (type.includes('account'))          return { label: 'View Profile', icon: 'profile' };
    if (type.startsWith('payment') || type === 'withdrawal_processed') return { label: 'View Wallet', icon: 'payment' };
    if (m.userId)                          return { label: 'View Profile', icon: 'profile' };
    return null;
  }

  runAction(): void {
    if (!this.notif) return;
    const m: any = this.notif.meta || {};
    const type   = this.notif.type || '';
    const title  = (this.notif.title || '').toLowerCase();

    if (m.ticketId && type === 'support') { this.router.navigate(['/my-tickets', m.ticketId]); return; }
    if (m.link) { this.router.navigateByUrl(m.link); return; }

    // Riders are neither the renter nor the owner, so /bookings/:id returns
    // "Access denied" for them. Older assignment notifications were saved
    // without a meta.link, so route riders to their own pages instead.
    if (this.isRider && m.bookingId) {
      // Older notifications have assignmentId but no link — still focus the job.
      const focus = m.assignmentId ? { queryParams: { highlight: m.assignmentId } } : {};
      if (title.includes('return')) { this.router.navigate(['/rider/pending-returns'], focus); return; }
      if (title.includes('completed') || title.includes('earning')) { this.router.navigate(['/rider/earnings']); return; }
      this.router.navigate(['/rider/deliveries'], focus);
      return;
    }
    if (m.bookingId) {
      if (title.includes('inspection')) {
        const type = title.includes('delivery') ? 'delivery' : 'return';
        this.router.navigate(['/inspection', type, m.bookingId]);
        return;
      }
      if (title.includes('rider') || title.includes('picked up') || title.includes('delivered')
          || title.includes('delivery completed')) {
        this.router.navigate(['/track'], { queryParams: { id: m.bookingId } });
        return;
      }
      if (title.includes('payment') || title.includes('paid') || title.includes('refund')) {
        this.router.navigate(['/payment/status', m.bookingId]);
        return;
      }
      this.router.navigate(['/bookings', m.bookingId]);
      return;
    }
    if (type.includes('message')) { this.router.navigate(['/messages']); return; }
    if (m.listingId) { this.router.navigate(['/listings', m.listingId]); return; }
    if (type.includes('cnic')) { this.router.navigate(['/verify-cnic']); return; }
    if (type.includes('account')) { this.router.navigate(['/profile']); return; }
    if (type.startsWith('payment') || type === 'withdrawal_processed') { this.router.navigate(['/wallet']); return; }
    if (m.userId) { this.router.navigate(['/profile']); return; }
  }

  fullDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-PK', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
