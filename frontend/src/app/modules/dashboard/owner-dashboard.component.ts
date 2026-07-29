import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../services/auth.service';
import { TrustBadgeComponent } from '../../shared/components/trust-badge/trust-badge.component';
import { SwitchAccountBannerComponent } from '../../shared/components/switch-account-banner/switch-account-banner.component';

// Chart.js via CDN — loaded in index.html
declare const Chart: any;

@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, DecimalPipe, DatePipe, TrustBadgeComponent, SwitchAccountBannerComponent],
  templateUrl: './owner-dashboard.component.html',
  styleUrls: ['./owner-dashboard.component.css'],
})
export class OwnerDashboardComponent implements OnInit, AfterViewInit, OnDestroy {

  /* ── Canvas refs ── */
  @ViewChild('earningsChart') earningsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bookingChart')  bookingChartRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('perfChart')     perfChartRef!:     ElementRef<HTMLCanvasElement>;

  /* ── Data ── */
  data: any = null;
  loading   = true;
  error     = '';

  /* ── Chart instances ── */
  private earningsChartInst: any = null;
  private bookingChartInst:  any = null;
  private perfChartInst:     any = null;

  /* ── Active booking tab ── */
  activeBookingTab: 'recent' | 'pending' = 'recent';

  /* ── Earnings period ── */
  earningsPeriod: '3m' | '6m' | '12m' = '6m';

  // Mirrors backend trustScore.service.js ADVANCE_PERCENT_BY_BADGE — used only
  // to preview "what % would I get at the next tier", the backend stays the
  // source of truth for the actual advance % applied to bookings.
  private readonly advanceByBadge: Record<string, number> = { Gold: 10, Silver: 20, Bronze: 30, none: 40 };
  getAdvanceForTier(tier: string): number {
    return this.advanceByBadge[tier] ?? 40;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private api:       ApiService,
    public  authState: AuthService,
    private router:    Router,
  ) {}

  // Getter — safely extracts first name without optional chain issues in template
  get ownerFirstName(): string {
    return this.authState.currentUser?.name?.split(' ')[0] || 'there';
  }

  ngOnInit(): void {
    this.loadDashboard();
  }

  ngAfterViewInit(): void {
    // Charts drawn after data loads (see loadDashboard → drawCharts)
  }

  ngOnDestroy(): void {
    this.earningsChartInst?.destroy();
    this.bookingChartInst?.destroy();
    this.perfChartInst?.destroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load dashboard data ────────────────────────────────────────────────────
  loadDashboard(): void {
    this.api.get('/dashboard/owner')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.data    = res.data;
          this.loading = false;
          // Draw charts after DOM is ready
          setTimeout(() => this.drawCharts(), 100);
        },
        error: (err) => {
          this.error   = err.error?.message || 'Failed to load dashboard.';
          this.loading = false;
        },
      });
  }

  // ── Draw both charts ───────────────────────────────────────────────────────
  drawCharts(): void {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded. Add CDN to index.html');
      return;
    }
    this.drawEarningsChart();
    this.drawBookingPieChart();
    this.drawPerfChart();
  }

  // ── Listings Performance donut ─────────────────────────────────────────────
  drawPerfChart(): void {
    const canvas = this.perfChartRef?.nativeElement;
    if (!canvas || !this.data?.listings) return;
    this.perfChartInst?.destroy();
    const l = this.data.listings;
    const b = this.data.bookings || {};
    this.perfChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Rented', 'Inactive', 'Pending'],
        datasets: [{
          data: [l.active || 0, l.rented || 0, l.inactive || 0, b.pending || 0],
          backgroundColor: ['#1F5435', '#2563eb', '#E8A33D', '#92400e'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: { legend: { display: false } },
      },
    });
  }

  // ── Earnings Bar Chart ─────────────────────────────────────────────────────
  drawEarningsChart(): void {
    const canvas = this.earningsChartRef?.nativeElement;
    if (!canvas || !this.data?.monthlyEarnings) return;
    this.earningsChartInst?.destroy();

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const count  = this.earningsPeriod === '3m' ? 3 : this.earningsPeriod === '12m' ? 12 : 6;
    const raw: any[] = this.data.monthlyEarnings.slice(-count);

    // Build labels and values — fill 0 for missing months
    const labels: string[] = [];
    const values: number[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const label = MONTHS[d.getMonth()];
      labels.push(label);
      const found = raw.find((r: any) => r._id?.month === d.getMonth() + 1);
      values.push(found?.earnings || 0);
    }

    this.earningsChartInst = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Earnings (PKR)',
          data: values,
          backgroundColor: 'rgba(31,84,53,0.78)',
          borderColor:     '#1F5435',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `PKR ${ctx.raw.toLocaleString()}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              callback: (val: any) => `PKR ${(val/1000).toFixed(0)}k`,
            },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ── Booking Status Pie Chart ───────────────────────────────────────────────
  drawBookingPieChart(): void {
    const canvas = this.bookingChartRef?.nativeElement;
    if (!canvas || !this.data?.bookings) return;
    this.bookingChartInst?.destroy();

    const b = this.data.bookings;
    const statuses = ['pending', 'confirmed', 'active', 'completed', 'cancelled'];
    const labels   = ['Pending', 'Confirmed', 'Active', 'Completed', 'Cancelled'];
    const values   = statuses.map(s => b[s] || 0);
    const colors   = ['#E8A33D', '#2563eb', '#0d9488', '#1F5435', '#dc2626'];

    // Only show slices > 0
    const filtered = labels
      .map((l, i) => ({ l, v: values[i], c: colors[i] }))
      .filter(x => x.v > 0);

    if (!filtered.length) return;

    this.bookingChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: filtered.map(x => x.l),
        datasets: [{
          data:            filtered.map(x => x.v),
          backgroundColor: filtered.map(x => x.c),
          borderWidth: 3,
          borderColor: '#fff',
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, font: { size: 12 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx: any) => ` ${ctx.label}: ${ctx.raw} bookings`,
            },
          },
        },
      },
    });
  }

  // Redraw earnings chart on period change
  onEarningsPeriodChange(period: '3m' | '6m' | '12m'): void {
    this.earningsPeriod = period;
    setTimeout(() => this.drawEarningsChart(), 50);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  Math = Math;

  get totalEarnings(): number {
    return this.data?.monthlyEarnings?.reduce((sum: number, m: any) => sum + (m.earnings || 0), 0) || 0;
  }

  get totalListings(): number {
    const l = this.data?.listings;
    if (!l) return 0;
    return (l.active || 0) + (l.inactive || 0) + (l.rented || 0);
  }

  get totalBookings(): number {
    const b = this.data?.bookings;
    if (!b) return 0;
    return (b.pending || 0) + (b.confirmed || 0) + (b.active || 0) + (b.completed || 0) + (b.cancelled || 0);
  }

  get avgRating(): number {
    return this.data?.reviews?.averageRating || 0;
  }

  get balance(): number {
    return this.data?.wallet?.balance || 0;
  }

  go(path: string): void {
    this.router.navigateByUrl(path);
  }

  getBookingStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending:   'status-pending',
      confirmed: 'status-confirmed',
      active:    'status-active',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
    };
    return map[status] || '';
  }

  getListingImage(booking: any): string {
    return booking?.listing?.images?.[0]?.url || '';
  }
}
