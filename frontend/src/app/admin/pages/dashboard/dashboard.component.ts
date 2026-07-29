// src/app/admin/pages/dashboard/dashboard.component.ts
/**
 * AdminDashboardComponent — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the admin overview with LIVE Chart.js charts (no mock data):
 *   • Revenue Overview  → line/area  (GET /admin/charts/revenue?period=)
 *   • Bookings          → bar        (GET /admin/charts/bookings?period=)
 *   • User Distribution → doughnut   (real stats: owners vs renters)
 *   • Category breakdown→ doughnut   (GET /admin/charts/categories)
 *
 * Chart.js 4.4.3 is loaded globally via CDN in index.html, so we use
 * `declare const Chart: any;` (same pattern the project already uses).
 *
 * Lifecycle safety:
 *   - charts are drawn inside setTimeout(...,100) AFTER data arrives
 *     (so the <canvas> exists in the DOM)
 *   - old chart instances are destroy()-ed before redrawing
 *   - all instances destroyed in ngOnDestroy (avoids canvas-reuse errors)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { DashboardStats, RecentBooking, RecentUser, EMPTY_DASHBOARD_STATS } from '../../models/admin-dashboard.models';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';

// Chart.js global (loaded via CDN in index.html)
declare const Chart: any;

@Component({
  selector:    'app-admin-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterModule, DecimalPipe, DatePipe, KpiCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrls:   ['./dashboard.component.css'],
})
export class AdminDashboardComponent implements OnInit, OnDestroy {

  loading = true;
  stats:   DashboardStats = { ...EMPTY_DASHBOARD_STATS };
  recentBookings: RecentBooking[] = [];
  recentUsers:    RecentUser[] = [];
  pendingCNIC:    any[] = [];

  // Revenue chart period (wired to Monthly/Weekly/Daily tabs)
  revenuePeriod: 'monthly' | 'weekly' | 'daily' = 'monthly';

  // Empty-state flags (true = no data → show clean empty message, not fake bars)
  revenueEmpty  = false;
  bookingsEmpty = false;
  usersEmpty    = false;
  categoryEmpty = false;
  cnicStatusEmpty = false;
  faceMatchEmpty  = false;

  // Canvas refs
  @ViewChild('revenueCanvas')  revenueCanvas!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('bookingsCanvas') bookingsCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('usersCanvas')    usersCanvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryCanvas') categoryCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cnicStatusCanvas')  cnicStatusCanvas!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('faceMatchCanvas')   faceMatchCanvas!:   ElementRef<HTMLCanvasElement>;

  // Chart instances (kept so we can destroy before redraw)
  private revenueChart:  any = null;
  private bookingsChart: any = null;
  private usersChart:    any = null;
  private categoryChart: any = null;
  private cnicStatusChart: any = null;
  private faceMatchChart:  any = null;

  // Brand palette — matches the Rider Dashboard's exact forest-green scheme,
  // so charts look consistent across every role's dashboard in the app.
  private readonly GREEN      = '#14532D';               // forest green (primary)
  private readonly GREEN_SOFT = 'rgba(20,83,45,0.18)';    // translucent fill for area charts
  private readonly BLUE       = '#3b82f6';                // secondary accent (renters, confirmed states)
  private readonly AMBER      = '#f59e0b';                // warning / pending accent
  private readonly ACCENT     = '#8b5cf6';                // tertiary accent (purple, misc categories)

  constructor(private adminSvc: AdminService, private router: Router) {}

  // ── Hero actions ────────────────────────────────────────────────────────────
  // Both buttons were markup only — no click handlers — so nothing happened.
  exporting = false;

  /** Download a bookings report as CSV. The reports API returns JSON rows, so
   *  the CSV is assembled here (same approach as the Revenue page export). */
  exportReport(): void {
    if (this.exporting) return;
    this.exporting = true;
    this.adminSvc.getReport('bookings').subscribe({
      next: (res: any) => {
        const rows: any[] = res?.data?.rows || res?.data || [];
        this.exporting = false;
        if (!rows.length) { alert('No data available to export.'); return; }

        const headers = Object.keys(rows[0]);
        const esc = (v: any) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [
          headers.join(','),
          ...rows.map(r => headers.map(h => esc(r[h])).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rentify-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting = false;
        // Reports page has filters and per-type export — better than a dead button.
        this.router.navigate(['/admin/reports']);
      },
    });
  }

  ngOnInit(): void {
    // 1. KPI stats (also feeds user-distribution doughnut)
    this.adminSvc.getDashboardStats().subscribe({
      next: (res: any) => {
        this.stats   = { ...EMPTY_DASHBOARD_STATS, ...(res.data || {}) };
        this.loading = false;
        // Draw user-distribution once stats are in
        setTimeout(() => this.drawUsersChart(), 100);
      },
      error: () => { this.stats = { ...EMPTY_DASHBOARD_STATS }; this.loading = false; },
    });

    // 2. Recent activity tables
    this.adminSvc.getRecentActivity().subscribe({
      next: (res: any) => {
        this.recentBookings = res.data?.bookings    || [];
        this.recentUsers    = res.data?.users       || [];
        this.pendingCNIC    = res.data?.pendingCNIC || [];
      },
      error: () => { this.recentBookings = []; this.recentUsers = []; },
    });

    // 3. Charts wired to real endpoints
    this.loadRevenueChart();
    this.loadBookingsChart();
    this.loadCategoryChart();
    this.loadCnicStatusChart();
    this.loadFaceMatchChart();
  }

  ngOnDestroy(): void {
    // Always destroy to avoid "canvas already in use" errors
    [this.revenueChart, this.bookingsChart, this.usersChart, this.categoryChart,
     this.cnicStatusChart, this.faceMatchChart]
      .forEach(c => c?.destroy());
  }

  // ── Revenue chart (line/area) ──────────────────────────────────────────────
  setRevenuePeriod(period: 'monthly' | 'weekly' | 'daily'): void {
    if (this.revenuePeriod === period) return;
    this.revenuePeriod = period;
    this.loadRevenueChart();
  }

  loadRevenueChart(): void {
    this.adminSvc.getRevenueChart(this.revenuePeriod).subscribe({
      next: (res: any) => {
        const labels = res.data?.labels || [];
        const values = res.data?.values || [];
        this.revenueEmpty = values.every((v: number) => v === 0);
        setTimeout(() => this.drawRevenueChart(labels, values), 100);
      },
      error: () => { this.revenueEmpty = true; },
    });
  }

  private drawRevenueChart(labels: string[], values: number[]): void {
    if (!this.revenueCanvas || this.revenueEmpty) return;
    this.revenueChart?.destroy();
    const ctx = this.revenueCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Gradient fill under the line
    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(20,83,45,0.28)');  // forest green, fading to transparent
    grad.addColorStop(1, 'rgba(20,83,45,0.0)');

    this.revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Revenue (Rs)',
          data: values,
          borderColor: this.GREEN,
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 3,
          pointBackgroundColor: this.GREEN,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#111827', titleColor: '#fff', bodyColor: '#fff', borderColor: '#111827', borderWidth: 1, padding: 10, cornerRadius: 8 },
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#eef2ec' }, ticks: { color: '#6b7280' } },
          x: { grid: { display: false }, ticks: { color: '#6b7280' } },
        },
      },
    });
  }

  // ── Bookings chart (bar) ───────────────────────────────────────────────────
  loadBookingsChart(): void {
    this.adminSvc.getBookingsChart('monthly').subscribe({
      next: (res: any) => {
        const labels = res.data?.labels || [];
        const values = res.data?.values || [];
        this.bookingsEmpty = values.every((v: number) => v === 0);
        setTimeout(() => this.drawBookingsChart(labels, values), 100);
      },
      error: () => { this.bookingsEmpty = true; },
    });
  }

  private drawBookingsChart(labels: string[], values: number[]): void {
    if (!this.bookingsCanvas || this.bookingsEmpty) return;
    this.bookingsChart?.destroy();
    const ctx = this.bookingsCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    this.bookingsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Bookings',
          data: values,
          backgroundColor: this.GREEN,
          borderRadius: 6,
          maxBarThickness: 28,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#111827', titleColor: '#fff', bodyColor: '#fff', borderColor: '#111827', borderWidth: 1, padding: 10, cornerRadius: 8 },
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#eef2ec' }, ticks: { color: '#6b7280', precision: 0 } },
          x: { grid: { display: false }, ticks: { color: '#6b7280' } },
        },
      },
    });
  }

  // ── User distribution doughnut (owners vs renters) ─────────────────────────
  private drawUsersChart(): void {
    if (!this.usersCanvas) return;
    const total   = this.stats.totalUsers  || 0;
    const owners  = this.stats.totalOwners || 0;
    const renters = Math.max(total - owners, 0);
    this.usersEmpty = total === 0;
    if (this.usersEmpty) return;

    this.usersChart?.destroy();
    const ctx = this.usersCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    this.usersChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Renters', 'Owners'],
        datasets: [{
          data: [renters, owners],
          backgroundColor: [this.BLUE, this.GREEN],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#111827', titleColor: '#fff', bodyColor: '#fff', borderColor: '#111827', borderWidth: 1, padding: 10, cornerRadius: 8 },
        },
      },
    });
  }

  // ── Category breakdown doughnut ────────────────────────────────────────────
  loadCategoryChart(): void {
    this.adminSvc.getCategoryChart().subscribe({
      next: (res: any) => {
        const labels = res.data?.labels || [];
        const values = res.data?.values || [];
        this.categoryEmpty = values.length === 0;
        setTimeout(() => this.drawCategoryChart(labels, values), 100);
      },
      error: () => { this.categoryEmpty = true; },
    });
  }

  private drawCategoryChart(labels: string[], values: number[]): void {
    if (!this.categoryCanvas || this.categoryEmpty) return;
    this.categoryChart?.destroy();
    const ctx = this.categoryCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    const palette = ['#14532D', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#9ca3af'];
    this.categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: palette.slice(0, values.length),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#6b7280', boxWidth: 12, padding: 12 } },
          tooltip: { backgroundColor: '#111827', titleColor: '#fff', bodyColor: '#fff', borderColor: '#111827', borderWidth: 1, padding: 10, cornerRadius: 8 },
        },
      },
    });
  }

  // ── CNIC verification status (donut) ───────────────────────────────────────
  loadCnicStatusChart(): void {
    this.adminSvc.getCnicStatusChart().subscribe({
      next: (res: any) => {
        const labels = res.data?.labels || [];
        const values = res.data?.values || [];
        this.cnicStatusEmpty = values.every((v: number) => v === 0);
        setTimeout(() => this.drawCnicStatusChart(labels, values), 100);
      },
      error: () => { this.cnicStatusEmpty = true; },
    });
  }

  private drawCnicStatusChart(labels: string[], values: number[]): void {
    if (!this.cnicStatusCanvas || this.cnicStatusEmpty) return;
    this.cnicStatusChart?.destroy();
    const ctx = this.cnicStatusCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    // Verified / Pending / Rejected — green / amber / red, matching the
    // same semantic colors used everywhere else in the app for these states.
    const colors = [this.GREEN, this.AMBER, '#ef4444'];
    this.cnicStatusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#6b7280', boxWidth: 12, padding: 12 } },
          tooltip: { backgroundColor: '#111827', titleColor: '#fff', bodyColor: '#fff', borderColor: '#111827', borderWidth: 1, padding: 10, cornerRadius: 8 },
        },
      },
    });
  }

  // ── Face-match score distribution (bar/histogram) ──────────────────────────
  loadFaceMatchChart(): void {
    this.adminSvc.getFaceMatchChart().subscribe({
      next: (res: any) => {
        const labels = res.data?.labels || [];
        const values = res.data?.values || [];
        this.faceMatchEmpty = values.every((v: number) => v === 0);
        setTimeout(() => this.drawFaceMatchChart(labels, values), 100);
      },
      error: () => { this.faceMatchEmpty = true; },
    });
  }

  private drawFaceMatchChart(labels: string[], values: number[]): void {
    if (!this.faceMatchCanvas || this.faceMatchEmpty) return;
    this.faceMatchChart?.destroy();
    const ctx = this.faceMatchCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    // Color the bars by range — the below-threshold bucket in red as a
    // visual flag, mid-range in amber, high-confidence ranges in green.
    const barColors = ['#ef4444', '#f59e0b', '#f59e0b', '#84cc16', this.GREEN];
    this.faceMatchChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Accounts',
          data: values,
          backgroundColor: barColors.slice(0, values.length),
          borderRadius: 6,
          maxBarThickness: 36,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#111827', titleColor: '#fff', bodyColor: '#fff', borderColor: '#111827', borderWidth: 1, padding: 10, cornerRadius: 8 },
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#eef2ec' }, ticks: { color: '#6b7280', precision: 0 } },
          x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 10 } } },
        },
      },
    });
  }

  // ── Status badge color (used by recent bookings table) ─────────────────────
  statusColor(s: string): string {
    const m: Record<string, string> = {
      confirmed: 'badge-confirmed', pending: 'badge-pending',
      active: 'badge-active', completed: 'badge-completed',
      cancelled: 'badge-cancelled', rejected: 'badge-rejected',
    };
    return m[s] || '';
  }
}
