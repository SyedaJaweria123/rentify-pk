// src/app/admin/layouts/admin-layout.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent }      from '../components/sidebar/sidebar.component';
import { AdminNavbarComponent }  from '../components/navbar/navbar.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, AdminNavbarComponent],
  templateUrl: './admin-layout.component.html',
  styleUrls:   ['./admin-layout.component.css'],
})
export class AdminLayoutComponent {
  mobileOpen = signal(false);
  darkMode   = false;

  toggleMobileMenu(): void { this.mobileOpen.update(v => !v); }
}
