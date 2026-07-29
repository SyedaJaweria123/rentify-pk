// src/app/admin/components/navbar/navbar.component.ts
import { Component, OnInit, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, NavigationEnd, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { NotificationService, AppNotification } from '../../../modules/notifications/notification.service';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls:   ['./navbar.component.css'],
})
export class AdminNavbarComponent implements OnInit {
  @Output() toggleMobile = new EventEmitter<void>();

  pageTitle      = 'Dashboard';
  searchQuery    = '';
  darkMode       = false;
  notifMenuOpen  = false;
  profileMenuOpen = false;

  userName    = '';
  userRole    = '';
  userAvatar  = '';
  userInitial = 'A';

  // Real notifications (from NotificationService)
  recentNotifs: AppNotification[] = [];
  notifsLoading = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    public notifSvc: NotificationService,
  ) {}

  ngOnInit(): void {
    const u = this.auth.currentUser as any;
    if (u) {
      this.userName    = u.name || 'Admin';
      this.userRole    = u.role || 'admin';
      this.userAvatar  = u.avatar || '';
      this.userInitial = (u.name || 'A').charAt(0).toUpperCase();
    }

    // Set page title from route
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => { this.pageTitle = this.getTitleFromUrl(this.router.url); });

    // Load unread notification count
    this.notifSvc.refreshCount();
    this.pageTitle = this.getTitleFromUrl(this.router.url);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.notif-wrapper'))   this.notifMenuOpen   = false;
    if (!t.closest('.profile-wrapper')) this.profileMenuOpen = false;
  }

  toggleNotifMenu(): void {
    this.notifMenuOpen = !this.notifMenuOpen;
    this.profileMenuOpen = false;
    if (this.notifMenuOpen) this.loadNotifs();
  }
  toggleProfileMenu(): void { this.profileMenuOpen = !this.profileMenuOpen; this.notifMenuOpen = false; }
  closeMenus(): void { this.notifMenuOpen = false; this.profileMenuOpen = false; }

  // Load the latest notifications when the dropdown opens
  loadNotifs(): void {
    this.notifsLoading = true;
    this.notifSvc.getAll(1, 8).subscribe({
      next: (res: any) => { this.recentNotifs = res?.data?.notifications || []; this.notifsLoading = false; },
      error: () => { this.recentNotifs = []; this.notifsLoading = false; },
    });
  }

  markAllRead(): void {
    this.notifSvc.markAllRead().subscribe({
      next: () => { this.recentNotifs = this.recentNotifs.map(n => ({ ...n, isRead: true })); },
    });
  }

  // Click a notification → mark read + go to the relevant ADMIN page
  openNotif(n: AppNotification): void {
    if (!n.isRead) this.notifSvc.markRead(n._id).subscribe();
    n.isRead = true;
    const m = n.meta || {};
    this.closeMenus();

    const t = ((n.title || '') + ' ' + (n.type || '')).toLowerCase();

    // Inspection notifications → open the actual condition report for that booking
    if (t.includes('inspection') && m.bookingId) {
      const type = t.includes('delivery') ? 'delivery' : 'return';
      this.router.navigate(['/inspection', type, m.bookingId]);
      return;
    }

    let target = '/admin/notifications';
    if (t.includes('payment') || t.includes('proof'))                    target = '/admin/payment-proofs';
    else if (t.includes('cnic') || t.includes('verification'))           target = '/admin/cnic-queue';
    else if (t.includes('dispute'))                                      target = '/admin/disputes';
    else if (t.includes('damage'))                                       target = '/admin/damage-claims';
    else if (t.includes('ticket') || t.includes('support'))              target = '/admin/support-tickets';
    else if (t.includes('contact'))                                      target = '/admin/contact-messages';
    else if (t.includes('booking') || m.bookingId)                       target = '/admin/bookings';
    else if (t.includes('listing') || m.listingId)                       target = '/admin/listings';
    else if (t.includes('user') || t.includes('owner') || m.userId)      target = '/admin/users';

    this.router.navigate([target]);
  }

  toggleTheme(): void { this.darkMode = !this.darkMode; }

  onSearch(q: string): void { /* emit to parent or use service */ }

  logout(): void { this.closeMenus(); this.auth.logout(); }

  // "2 min ago" style relative time from an ISO date
  relativeTime(iso: string): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1)   return 'just now';
    if (min < 60)  return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)   return `${hr} hr ago`;
    const d = Math.floor(hr / 24);
    return `${d} day${d > 1 ? 's' : ''} ago`;
  }

  private getTitleFromUrl(url: string): string {
    const map: Record<string, string> = {
      '/admin':             'Dashboard',
      '/admin/analytics':   'Analytics',
      '/admin/users':       'User Management',
      '/admin/listings':    'Listings',
      '/admin/bookings':    'Bookings',
      '/admin/revenue':     'Revenue',
      '/admin/notifications': 'Notifications',
      '/admin/reports':     'Reports',
      '/admin/activity-logs': 'Activity Logs',
      '/admin/settings':    'Settings',
    };
    return map[url.split('?')[0]] || 'Admin';
  }
}
