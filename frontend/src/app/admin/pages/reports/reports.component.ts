// src/app/admin/pages/reports/reports.component.ts
/**
 * Admin · Reports — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Date range picker (from / to)
 *  • Report type selector: Users | Revenue | Listings | Bookings
 *  • Preview table of the returned rows
 *  • Export CSV (client-side) + Export "PDF" (print-to-PDF via window.print)
 *  API: GET /api/admin/reports/:type?from=&to=
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css'],
})
export class AdminReportsComponent {
  reportType = 'users';
  fromDate = '';
  toDate = '';

  rows    = signal<any[]>([]);
  columns = signal<string[]>([]);
  loading = signal(false);
  error   = signal('');
  generated = signal(false);

  readonly types = [
    { value: 'users',    label: 'Users Report' },
    { value: 'revenue',  label: 'Revenue Report' },
    { value: 'listings', label: 'Listings Report' },
    { value: 'bookings', label: 'Bookings Report' },
  ];

  constructor(private adminSvc: AdminService) {}

  generate(): void {
    this.loading.set(true);
    this.error.set('');
    this.generated.set(false);
    const params: any = {};
    if (this.fromDate) params.from = this.fromDate;
    if (this.toDate)   params.to   = this.toDate;

    this.adminSvc.getReport(this.reportType, params).subscribe({
      next: (res: any) => {
        const rows = res.data?.rows || [];
        this.rows.set(rows);
        this.columns.set(rows.length ? Object.keys(rows[0]) : []);
        this.generated.set(true);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to generate report.'); this.loading.set(false); },
    });
  }

  // Pretty column header (date → Date, totalAmount → Total Amount)
  colLabel(c: string): string {
    return c.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  }
  isDateCol(c: string): boolean { return c === 'date'; }

  // ── Export CSV (client-side) ─────────────────────────────────────────────────
  exportCsv(): void {
    const rows = this.rows();
    if (rows.length === 0) { alert('Generate a report first.'); return; }
    const cols = this.columns();
    const header = cols.join(',');
    const lines = rows.map(r =>
      cols.map(c => String(r[c] ?? '').replace(/,/g, ' ')).join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${this.reportType}-report-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export PDF (browser print dialog → save as PDF) ──────────────────────────
  exportPdf(): void {
    if (this.rows().length === 0) { alert('Generate a report first.'); return; }
    window.print();
  }
}
