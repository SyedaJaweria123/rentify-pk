import { Component, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { NotificationService, AppNotification } from './notification.service';
import { SocketService } from '../../core/services/socket.service';
import { AuthService } from '../../services/auth.service';
import { RiderLayoutComponent } from '../rider/rider-layout.component';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatSnackBarModule, MatProgressSpinnerModule, RiderLayoutComponent, OwnerLayoutComponent, RenterLayoutComponent],
  templateUrl: './notifications-page.component.html',
  styleUrls: ['./notifications-page.component.css'],
})
export class NotificationsPageComponent implements OnInit {

  get isRider(): boolean { return String(this.auth.currentUser?.role || '') === 'rider'; }
  get isOwner(): boolean { return this.auth.isOwner; }

  notifications: AppNotification[] = [];
  loading    = true;
  page       = 1;
  limit      = 100;   // fetch many so client-side type/search filters see everything
  total      = 0;
  totalPages = 1;
  unreadCount = 0;

  search = '';
  typeFilter = '';   // '', 'support', 'booking', 'payment', 'message', 'system'
  private searchTimer: any = null;

  readonly typeFilters = [
    { value: '',        label: 'All' },
    { value: 'support', label: 'Support' },
    { value: 'booking', label: 'Booking' },
    { value: 'payment', label: 'Payment' },
    { value: 'message', label: 'Messages' },
    { value: 'system',  label: 'System' },
  ];

  constructor(
    private notifService: NotificationService,
    private router:       Router,
    private snack:        MatSnackBar,
    private socket:       SocketService,
    public  auth:         AuthService,
  ) {
    const addLive = (data: any) => {
      if (!data) return;
      this.notifications = [
        {
          _id: 'live-' + Date.now(),
          title: data.title,
          body: data.message,
          type: data.type || 'system',
          isRead: false,
          createdAt: new Date().toISOString(),
          meta: { link: data.link, ticketId: data.ticketId },
        } as AppNotification,
        ...this.notifications,
      ];
      this.unreadCount++;
    };
    effect(() => addLive(this.socket.lastMessage()));
    effect(() => addLive(this.socket.lastBooking()));
    effect(() => addLive(this.socket.lastReview()));
    effect(() => addLive(this.socket.lastSupport()));
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.notifService.getAll(this.page, this.limit).subscribe({
      next: (res) => {
        this.notifications = res.data.notifications;
        this.total         = res.data.pagination.total;
        this.totalPages    = res.data.pagination.totalPages;
        this.unreadCount   = res.data.unreadCount;
        this.loading       = false;
      },
      error: () => { this.loading = false; },
    });
  }

  // ── Client-side filter (search + type) over loaded notifications ──
  get filteredNotifications(): AppNotification[] {
    let list = this.notifications;
    if (this.typeFilter) {
      list = list.filter(n => this.matchesGroup(n, this.typeFilter));
    }
    if (this.search.trim()) {
      const q = this.search.toLowerCase();
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.body  || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  /** Match a notification to a filter group by its type OR its title/body text. */
  private matchesGroup(n: AppNotification, group: string): boolean {
    const t = (n.type || '').toLowerCase();
    const text = ((n.title || '') + ' ' + (n.body || '')).toLowerCase();
    const has = (...words: string[]) => words.some(w => t.includes(w) || text.includes(w));

    if (group === 'support') return has('support', 'ticket', 'help');
    if (group === 'booking') return t.startsWith('booking') || has('booking', 'dispute', 'delivery', 'pickup', 'return', 'rental', 'reservation');
    if (group === 'payment') return has('payment', 'wallet', 'escrow', 'withdraw', 'refund', 'earning', 'paid', 'advance', 'balance', 'transaction', 'rs.', 'deposit');
    if (group === 'message') return has('message', 'chat', 'review', 'rating');
    if (group === 'system')  return t === 'system' || has('cnic', 'listing', 'account', 'trust', 'verified', 'suspended', 'approved', 'rejected');
    return true;
  }

  onSearch(): void { /* getter handles it; debounce not required for client filter */ }

  hasFilters(): boolean { return !!this.search.trim() || !!this.typeFilter; }
  clearFilters(): void { this.search = ''; this.typeFilter = ''; }

  markAllRead(): void {
    this.notifService.markAllRead().subscribe({
      next: () => {
        this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
        this.unreadCount   = 0;
        this.notifService.refreshCount();
      },
    });
  }

  handleClick(n: AppNotification): void {
    this.notifService.setSelected(n);
    this.router.navigate(['/notifications', n._id]);
  }

  deleteNotif(event: Event, id: string): void {
    event.stopPropagation();
    this.notifService.delete(id).subscribe({
      next: () => {
        this.notifications = this.notifications.filter(n => n._id !== id);
        this.snack.open('Notification deleted', 'Close', { duration: 2000 });
      },
    });
  }

  changePage(p: number): void { if (p < 1 || p > this.totalPages) return; this.page = p; this.load(); }

  // SVG icon key by type group — falls back to title keywords for the many
  // backend notifications that are stored with the generic type 'system'
  // (rider updates, delivery steps, damage claims, listing status changes).
  iconKey(type: string, title?: string): string {
    const t  = (type  || '').toLowerCase();
    const ti = (title || '').toLowerCase();

    if (ti.includes('rider'))                                    return 'rider';
    if (ti.includes('damage') || ti.includes('claim'))            return 'claim';
    if (ti.includes('picked up') || ti.includes('delivered') || ti.includes('delivery') || ti.includes('inspection')) return 'delivery';
    if (t === 'support')                                          return 'support';
    if (t.startsWith('booking') || ti.includes('booking'))        return 'booking';
    if (t.startsWith('payment') || t === 'withdrawal_processed' || ti.includes('payment') || ti.includes('refund') || ti.includes('payout') || ti.includes('deposit')) return 'payment';
    if (t.includes('review') || ti.includes('review'))            return 'star';
    if (t.includes('message'))                                    return 'message';
    if (t.includes('dispute') || ti.includes('dispute'))          return 'alert';
    if (t.includes('cnic'))                                       return 'shield';
    if (t.includes('listing') || ti.includes('listing'))          return 'box';
    return 'bell';
  }

  iconTone(type: string, title?: string): string {
    const key = this.iconKey(type, title);
    switch (key) {
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

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  trackById(_i: number, n: AppNotification): string { return n._id; }
}
