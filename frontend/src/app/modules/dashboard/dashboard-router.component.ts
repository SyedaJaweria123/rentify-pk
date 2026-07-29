import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { OwnerDashboardComponent } from './owner-dashboard.component';
import { RenterDashboardComponent } from './renter-dashboard.component';
import { RenterLayoutComponent } from './renter-layout.component';
import { OwnerLayoutComponent } from './owner-layout.component';

@Component({
  selector: 'app-dashboard-router',
  standalone: true,
  imports: [CommonModule, OwnerDashboardComponent, RenterDashboardComponent, RenterLayoutComponent, OwnerLayoutComponent],
  template: `
    <app-owner-layout *ngIf="isOwner">
      <app-owner-dashboard></app-owner-dashboard>
    </app-owner-layout>
    <app-renter-layout *ngIf="!isOwner">
      <app-renter-dashboard></app-renter-dashboard>
    </app-renter-layout>
  `,
})
export class DashboardRouterComponent implements OnInit {
  isOwner = false;

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    const role = String(this.auth.currentUser?.role || '');
    if (role === 'rider') { this.router.navigateByUrl('/rider'); return; }
    this.isOwner = this.auth.isOwner;
  }
}
