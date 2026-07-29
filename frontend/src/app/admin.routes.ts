// src/app/admin/admin.routes.ts
import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { AdminLayoutComponent } from './layouts/admin-layout.component';

export const adminRoutes: Routes = [
  // ── Admin Login (no auth required) ────────────────────────────────────────
  {
    path: 'admin/login',
    loadComponent: () => import('./pages/login/admin-login.component')
      .then(m => m.AdminLoginComponent),
  },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard/dashboard.component')
          .then(m => m.AdminDashboardComponent),
      },
      {
        path: 'analytics',
        loadComponent: () => import('./pages/analytics/analytics.component')
          .then(m => m.AdminAnalyticsComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/users/users.component')
          .then(m => m.AdminUsersComponent),
      },
      {
        path: 'listings',
        loadComponent: () => import('./pages/listings/listings.component')
          .then(m => m.AdminListingsComponent),
      },
      {
        path: 'bookings',
        loadComponent: () => import('./pages/bookings/bookings.component')
          .then(m => m.AdminBookingsComponent),
      },
      {
        path: 'damage-claims',
        loadComponent: () => import('./pages/damage-claims/damage-claims.component').then(m => m.AdminDamageClaimsComponent),
      },
      {
        path: 'cnic-queue',
        loadComponent: () => import('./pages/cnic-queue/cnic-queue.component')
          .then(m => m.AdminCnicQueueComponent),
      },
      {
        path: 'revenue',
        loadComponent: () => import('./pages/revenue/revenue.component')
          .then(m => m.AdminRevenueComponent),
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications/notifications.component')
          .then(m => m.AdminNotificationsComponent),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports/reports.component')
          .then(m => m.AdminReportsComponent),
      },
      {
        path: 'activity-logs',
        loadComponent: () => import('./pages/activity-logs/activity-logs.component')
          .then(m => m.AdminActivityLogsComponent),
      },
      {
        path: 'support-tickets',
        loadComponent: () => import('./pages/support-tickets/support-tickets.component')
          .then(m => m.AdminSupportTicketsComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.component')
          .then(m => m.AdminSettingsComponent),
      },
    ],
  },
];
