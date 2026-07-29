import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { WalletService } from '../wallet/wallet.service';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';

// Chart.js via CDN — loaded in index.html (same pattern as owner-dashboard)
declare const Chart: any;

/**
 * Owner Earnings Report — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * A dedicated report page (linked from the owner sidebar) that combines:
 *  - /dashboard/owner  → monthlyEarnings trend, pending payout, total booking revenue
 *  - /wallet/summary   → all-time totals (earned, withdrawn, refunded)
 *  - /wallet/transactions → the full paginated ledger, filterable by type
 * Reuses the existing WalletService/ApiService rather than adding new
 * backend endpoints — all figures come straight from real transaction data.
 */
@Component({
  selector: 'app-owner-earnings',
  standalone: true,
  imports: [CommonModule, RouterModule, DecimalPipe, DatePipe, OwnerLayoutComponent],
  templateUrl: './owner-earnings.component.html',
  styleUrls: ['./owner-earnings.component.css'],
})
export class OwnerEarningsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('trendChart')     trendChartRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('growthChart')    growthChartRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('breakdownChart') breakdownChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart')    statusChartRef!:    ElementRef<HTMLCanvasElement>;
  private trendChartInst:     any = null;
  private growthChartInst:    any = null;
  private breakdownChartInst: any = null;
  private statusChartInst:    any = null;

  loading      = true;
  loadingTx    = false;
  error        = '';

  dashboard: any = null;   // /dashboard/owner response
  summary:   any = null;   // /wallet/summary response

  transactions: any[] = [];
  pagination:   any    = null;
  page          = 1;
  activeFilter  = '';

  earningsPeriod: '3m' | '6m' | '12m' = '6m';

  readonly txFilters = [
    { label: 'All',       value: '' },
    { label: 'Earnings',  value: 'booking_earning' },
    { label: 'Withdrawals', value: 'withdrawal' },
    { label: 'Refunds',   value: 'refund' },
    { label: 'Bonuses',   value: 'referral_bonus' },
  ];

  constructor(
    private api:      ApiService,
    private walletSvc: WalletService,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  ngAfterViewInit(): void {
    // Chart is (re)drawn once dashboard data is in — see loadAll()
  }

  ngOnDestroy(): void {
    this.trendChartInst?.destroy();
    this.growthChartInst?.destroy();
    this.breakdownChartInst?.destroy();
    this.statusChartInst?.destroy();
  }

  loadAll(): void {
    this.loading = true;
    this.error   = '';

    this.api.get('/dashboard/owner').subscribe({
      next: (res: any) => {
        this.dashboard = res.data;
        this.loading   = false;
        setTimeout(() => { this.drawTrendChart(); this.drawGrowthChart(); this.drawStatusChart(); }, 100);
      },
      error: (err) => {
        this.error   = err.error?.message || 'Failed to load earnings data.';
        this.loading = false;
      },
    });

    this.walletSvc.getSummary().subscribe({
      next: (res) => { this.summary = res.data; setTimeout(() => this.drawBreakdownChart(), 100); },
      error: () => {},
    });

    this.loadTransactions(1);
  }

  loadTransactions(page: number): void {
    this.page      = page;
    this.loadingTx = true;
    this.walletSvc.getTransactions({ page, limit: 10, type: this.activeFilter || undefined }).subscribe({
      next: (res) => {
        this.transactions = res.data.transactions;
        this.pagination    = res.data.pagination;
        this.loadingTx     = false;
      },
      error: () => { this.loadingTx = false; },
    });
  }

  onFilter(value: string): void {
    this.activeFilter = value;
    this.loadTransactions(1);
  }

  changePage(p: number): void {
    if (!this.pagination || p < 1 || p > this.pagination.totalPages) return;
    this.loadTransactions(p);
  }

  setPeriod(p: '3m' | '6m' | '12m'): void {
    this.earningsPeriod = p;
    this.drawTrendChart();
    this.drawGrowthChart();
  }

  // ── Shared helper: build {labels, values} for the selected period from monthlyEarnings ──
  private getMonthlySeries(): { labels: string[]; values: number[] } {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const count  = this.earningsPeriod === '3m' ? 3 : this.earningsPeriod === '12m' ? 12 : 6;
    const raw: any[] = this.dashboard?.monthlyEarnings || [];

    const labels: string[] = [];
    const values: number[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      labels.push(MONTHS[d.getMonth()]);
      const found = raw.find((r: any) => r._id?.month === d.getMonth() + 1 && r._id?.year === d.getFullYear());
      values.push(found?.earnings || 0);
    }
    return { labels, values };
  }

  // ── Earnings trend chart (bar) ──────────────────────────────────────────────
  drawTrendChart(): void {
    const canvas = this.trendChartRef?.nativeElement;
    if (!canvas || !this.dashboard?.monthlyEarnings || typeof Chart === 'undefined') return;
    this.trendChartInst?.destroy();

    const { labels, values } = this.getMonthlySeries();

    this.trendChartInst = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Earnings (PKR)',
          data: values,
          backgroundColor: 'rgba(31,84,53,0.85)',
          borderColor: '#1F5435',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 46,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f0f1ee' }, ticks: { callback: (v: any) => 'Rs ' + v } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ── Cumulative earnings growth (line) — running total over the same period ──
  drawGrowthChart(): void {
    const canvas = this.growthChartRef?.nativeElement;
    if (!canvas || !this.dashboard?.monthlyEarnings || typeof Chart === 'undefined') return;
    this.growthChartInst?.destroy();

    const { labels, values } = this.getMonthlySeries();
    let running = 0;
    const cumulative = values.map(v => (running += v));

    this.growthChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Cumulative Earnings (PKR)',
          data: cumulative,
          borderColor: '#1F5435',
          backgroundColor: 'rgba(31,84,53,0.12)',
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#1F5435',
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f0f1ee' }, ticks: { callback: (v: any) => 'Rs ' + v } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ── Earnings breakdown donut — Earned / Withdrawn / Refunded ────────────────
  drawBreakdownChart(): void {
    const canvas = this.breakdownChartRef?.nativeElement;
    if (!canvas || !this.summary || typeof Chart === 'undefined') return;
    this.breakdownChartInst?.destroy();

    const earned    = Math.max(0, (this.summary.totalEarned || 0) - (this.summary.totalWithdrawn || 0) - (this.summary.totalRefunded || 0));
    const withdrawn = this.summary.totalWithdrawn || 0;
    const refunded  = this.summary.totalRefunded || 0;

    this.breakdownChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Kept in Wallet', 'Withdrawn', 'Refunded'],
        datasets: [{
          data: [earned, withdrawn, refunded],
          backgroundColor: ['#1F5435', '#3b82f6', '#dc2626'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11.5 } } } },
      },
    });
  }

  // ── Booking status distribution donut ───────────────────────────────────────
  drawStatusChart(): void {
    const canvas = this.statusChartRef?.nativeElement;
    if (!canvas || !this.dashboard?.bookings || typeof Chart === 'undefined') return;
    this.statusChartInst?.destroy();

    const b = this.dashboard.bookings;
    this.statusChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Active', 'Confirmed', 'Pending', 'Cancelled'],
        datasets: [{
          data: [b.completed || 0, b.active || 0, b.confirmed || 0, b.pending || 0, b.cancelled || 0],
          backgroundColor: ['#1F5435', '#3b82f6', '#8b5cf6', '#E8A33D', '#dc2626'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11.5 } } } },
      },
    });
  }

  // ── Transaction row helpers ──────────────────────────────────────────────────
  isCredit(tx: any): boolean { return Number(tx.amount) > 0; }

  txLabel(type: string): string {
    const map: Record<string, string> = {
      booking_earning: 'Booking Earning',
      withdrawal: 'Withdrawal',
      withdrawal_failed: 'Withdrawal Reversed',
      refund: 'Refund',
      referral_bonus: 'Referral Bonus',
      rider_milestone_bonus: 'Milestone Bonus',
      adjustment: 'Adjustment',
      deposit_hold: 'Deposit Held',
      deposit_release: 'Deposit Released',
      service_fee: 'Service Fee',
      booking_payment: 'Booking Payment',
      rider_earning: 'Delivery Earning',
    };
    return map[type] || type;
  }

  // ── Export the currently loaded page of transactions as CSV ────────────────
  exportCsv(): void {
    if (!this.transactions.length) return;
    const rows = [
      ['Date', 'Type', 'Description', 'Amount', 'Balance After'],
      ...this.transactions.map(tx => [
        new Date(tx.createdAt).toLocaleString('en-PK'),
        this.txLabel(tx.type),
        (tx.description || '').replace(/,/g, ';'),
        tx.amount,
        tx.balance,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-report-page${this.page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
