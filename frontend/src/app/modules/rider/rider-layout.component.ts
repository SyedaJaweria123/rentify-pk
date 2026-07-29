import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../modules/notifications/notification.service';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { RiderService } from './rider.service';
import { RiderBadgeComponent } from '../../shared/components/rider-badge/rider-badge.component';

@Component({
  selector: 'app-rider-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterOutlet, NavbarComponent, RiderBadgeComponent],
  templateUrl: './rider-layout.component.html',
  styleUrls: ['./rider-layout.component.css'],
})
export class RiderLayoutComponent implements OnInit {
  pendingReturnsCount = signal(0);
  showLogoutConfirm = signal(false);

  constructor(
    public auth: AuthService,
    public notifSvc: NotificationService,
    private router: Router,
    private riderSvc: RiderService,
  ) {}

  ngOnInit(): void {
    this.notifSvc.refreshCount();
    this.loadPendingReturns();
  }

  get rider() { return this.auth.currentUser; }
  get unreadCount() { return this.notifSvc.unreadCount; }
  get riderRating(): number { return this.rider?.riderRating || 0; }

  private loadPendingReturns(): void {
    this.riderSvc.getPendingReturns().subscribe({
      next: (res) => this.pendingReturnsCount.set((res?.data || []).length),
      error: () => {},
    });
  }

  logout(): void { this.showLogoutConfirm.set(true); }
  confirmLogout(): void { this.showLogoutConfirm.set(false); this.auth.logout(); }
  cancelLogout(): void { this.showLogoutConfirm.set(false); }
}
