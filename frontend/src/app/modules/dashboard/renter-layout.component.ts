import { Component, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar.component';

/**
 * Renter Layout — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Sidebar shell for the renter experience, matching the rider layout. Navbar is
 * optional: inside MainLayout (dashboard) it's already provided (showNavbar=false);
 * standalone pages like /notifications set showNavbar=true.
 */
@Component({
  selector: 'app-renter-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterOutlet, NavbarComponent],
  templateUrl: './renter-layout.component.html',
  styleUrls: ['./renter-layout.component.css'],
})
export class RenterLayoutComponent {
  @Input() showNavbar = false;
  showLogoutConfirm = signal(false);

  constructor(public auth: AuthService, private router: Router) {}

  get user() { return this.auth.currentUser; }
  get isOwner(): boolean { return this.auth.isOwner; }

  logout(): void { this.showLogoutConfirm.set(true); }
  confirmLogout(): void { this.showLogoutConfirm.set(false); this.auth.logout(); }
  cancelLogout(): void { this.showLogoutConfirm.set(false); }
}
