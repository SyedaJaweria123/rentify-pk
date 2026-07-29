// src/app/admin/components/sidebar/sidebar.component.ts
/**
 * Admin Sidebar — "Midnight Command" dark theme — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Flat deep-dark (#10151C), teal-green (#00C48C) accents
 *  • 3 sections: OVERVIEW · MANAGEMENT · SYSTEM  (13 routes)
 *  • Inline Heroicons SVG (white default, teal when active) — no emoji icons
 *  • Live pending-CNIC badge from AdminService.getDashboardStats()
 *  • Collapsible desktop (252 ↔ 64px) + slide-in drawer on mobile
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { AdminService } from '../../services/admin.service';

interface NavItem { icon: string; label: string; path: string; exact?: boolean; badge?: boolean; }
interface NavSection { title: string; items: NavItem[]; }

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnInit {
  // ── KEEP EXACTLY (do not change) ────────────────────────────────────────────
  @Input()  mobileOpen = signal(false);
  @Output() mobileClose = new EventEmitter<void>();
  private auth  = inject(AuthService);
  private admin = inject(AdminService);
  // ─────────────────────────────────────────────────────────────────────────────

  collapsed       = signal(false);
  pendingCnicCount = signal(0);

  userName    = 'Admin';
  userRole    = 'admin';
  userInitial = 'A';

  /** 11 routes across 3 sections. */
  readonly sections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        { icon: 'dashboard', label: 'Dashboard', path: '/admin', exact: true },
        { icon: 'analytics', label: 'Analytics', path: '/admin/analytics' },
      ],
    },
    {
      title: 'Management',
      items: [
        { icon: 'users',    label: 'Users',      path: '/admin/users' },
        { icon: 'listings', label: 'Listings',   path: '/admin/listings' },
        { icon: 'bookings', label: 'Bookings',   path: '/admin/bookings' },
        { icon: 'cnic',     label: 'CNIC Queue', path: '/admin/cnic-queue', badge: true },
        { icon: 'support',  label: 'Support Tickets', path: '/admin/support-tickets' },
        { icon: 'support',  label: 'Contact Messages', path: '/admin/contact-messages' },
        { icon: 'dispute',  label: 'Disputes',    path: '/admin/disputes' },
        { icon: 'damage',   label: 'Damage Claims', path: '/admin/damage-claims' },
        { icon: 'revenue',  label: 'Payments',   path: '/admin/payment-proofs', badge: true },
        { icon: 'revenue',  label: 'Revenue',    path: '/admin/revenue' },
        { icon: 'revenue',  label: 'Platform Wallet', path: '/admin/platform-wallet' },
      ],
    },
    {
      title: 'System',
      items: [
        { icon: 'bell',     label: 'Notifications', path: '/admin/notifications' },
        { icon: 'reports',  label: 'Reports',       path: '/admin/reports' },
        { icon: 'activity', label: 'Activity Logs', path: '/admin/activity-logs' },
        { icon: 'settings', label: 'Settings',      path: '/admin/settings' },
      ],
    },
  ];

  ngOnInit(): void {
    const u = this.auth.currentUser as any;
    if (u) {
      this.userName    = u.name || 'Admin';
      this.userRole    = u.role || 'admin';
      this.userInitial = (u.name || 'A').charAt(0).toUpperCase();
    }
    // Live CNIC pending badge from real dashboard stats
    this.admin.getDashboardStats().subscribe({
      next: (res: any) => this.pendingCnicCount.set(res?.data?.pendingCNIC || 0),
      error: () => this.pendingCnicCount.set(0),
    });
  }

  toggleCollapse(): void { this.collapsed.update(v => !v); }
  closeMobile(): void    { this.mobileClose.emit(); }
  onNavClick(): void     { if (window.innerWidth <= 768) this.mobileClose.emit(); }
  logout(): void         { this.auth.logout(); }
}
