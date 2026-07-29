// src/app/admin/pages/revenue/revenue.component.ts
/**
 * Admin · Revenue & Financials — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 *  • KPI cards: Total Revenue, Platform Commission (service fees), Pending Payouts
 *  • Monthly revenue BAR chart (Chart.js — loaded via CDN, `declare const Chart`)
 *  • Transactions table: User | Type | Amount | Date | Status  (+ type filter)
 *  • Export to CSV button (client-side, from loaded transactions)
 *  APIs: GET /api/admin/revenue/summary, /transactions, /charts/revenue
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

// Chart.js is loaded globally from a CDN <script> in index.html
declare const Chart: any;

@Component({
  selector: 'app-admin-revenue',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  templateUrl: './revenue.component.html',
  styleUrls: ['./revenue.component.css'],
})
export class AdminRevenueComponent implements OnInit, AfterViewInit {
  @ViewChild('revenueCanvas') revenueCanvas!: ElementRef<HTMLCanvasElement>;

  // KPI summary
  totalEarned    = signal(0);
  totalFees      = signal(0);   // platform commission
  pendingPayouts = signal(0);   // withdrawals not yet completed (approx via withdrawn)
  summaryLoaded  = signal(false);

  // Transactions
  transactions = signal<any[]>([]);
  txnLoading   = signal(true);
  txnError     = signal('');
  typeFilter   = '';
  page = 1;
  limit = 10;
  totalPages = signal(1);

  private chart: any = null;
  private chartReady = false;

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void {
    this.loadSummary();
    this.loadTransactions();
  }

  ngAfterViewInit(): void {
    this.chartReady = true;
    this.drawChart();   // draws once revenue data arrives
  }

  // ── Summary cards ─────────────────────────────────────────────────────────
  private loadSummary(): void {
    this.adminSvc.getRevenueSummary().subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.totalEarned.set(d.totalEarned || 0);
        this.totalFees.set(d.totalFees || 0);
        this.pendingPayouts.set(d.totalWithdrawn || 0);
        this.summaryLoaded.set(true);
      },
      error: () => this.summaryLoaded.set(true),
    });
  }

  // ── Monthly revenue bar chart ─────────────────────────────────────────────
  private revenueLabels: string[] = [];
  private revenueValues: number[] = [];

  private loadChartData(): void {
    this.adminSvc.getRevenueChart('monthly').subscribe({
      next: (res: any) => {
        this.revenueLabels = res.data?.labels || [];
        this.revenueValues = res.data?.values || [];
        this.drawChart();
      },
    });
  }

  private drawChart(): void {
    if (!this.chartReady || !this.revenueCanvas) return;
    if (this.revenueLabels.length === 0) { this.loadChartData(); return; }
    if (typeof Chart === 'undefined') return;

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(this.revenueCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.revenueLabels,
        datasets: [{
          label: 'Revenue (PKR)',
          data: this.revenueValues,
          backgroundColor: '#1F5435',
          borderRadius: 8,
          maxBarThickness: 38,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v: any) => 'Rs ' + v } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ── Transactions table ────────────────────────────────────────────────────
  loadTransactions(): void {
    this.txnLoading.set(true);
    this.txnError.set('');
    this.adminSvc.getTransactions({ page: this.page, limit: this.limit, type: this.typeFilter }).subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.transactions.set(d.transactions || []);
        this.totalPages.set(d.pagination?.totalPages || 1);
        this.txnLoading.set(false);
      },
      error: () => { this.txnError.set('Failed to load transactions.'); this.txnLoading.set(false); },
    });
  }

  onTypeFilter(): void { this.page = 1; this.loadTransactions(); }
  prevPage(): void { if (this.page > 1) { this.page--; this.loadTransactions(); } }
  nextPage(): void { if (this.page < this.totalPages()) { this.page++; this.loadTransactions(); } }

  /** Platform fee rows have no user (the fee is the business's, not a wallet
   *  movement) — label them rather than showing a bare dash. */
  userName(t: any): string {
    if (t.user?.name) return t.user.name;
    return t.type === 'service_fee' ? 'Platform' : '—';
  }

  // ── Export current transactions to CSV ──────────────────────────────────────
  exportCsv(): void {
    const rows = this.transactions();
    if (rows.length === 0) { alert('No transactions to export.'); return; }
    const header = ['User', 'Type', 'Amount', 'Date', 'Status'];
    const lines = rows.map(t => [
      (t.user?.name || '—').replace(/,/g, ' '),
      t.type || '',
      t.amount || 0,
      new Date(t.createdAt).toLocaleDateString(),
      t.status || '',
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transactions-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
}
