import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DisputeAdminService } from '../../services/dispute-admin.service';

@Component({
  selector: 'app-admin-disputes',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './disputes.component.html',
  styleUrls: ['./disputes.component.css'],
})
export class AdminDisputesComponent implements OnInit {

  disputes: any[] = [];
  pagination = { page: 1, limit: 20, total: 0, pages: 1 };
  loading = true;
  error = '';

  statusFilter = '';
  readonly statuses = ['open', 'under_review', 'resolved', 'closed'];
  readonly resolutions = [
    { value: 'favor_renter', label: 'Favor Renter' },
    { value: 'favor_owner',  label: 'Favor Owner' },
    { value: 'split',        label: 'Split' },
    { value: 'dismissed',    label: 'Dismissed' },
  ];

  // Detail panel
  selected: any = null;
  resolution = '';
  note = '';
  actionBusy = false;
  actionMsg = '';

  constructor(private svc: DisputeAdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true; this.error = '';
    this.svc.list({
      page: this.pagination.page, limit: this.pagination.limit, status: this.statusFilter,
    }).subscribe({
      next: (res) => {
        this.disputes = res?.data || [];
        const p = res?.pagination || {};
        this.pagination = {
          page: p.page || 1, limit: p.limit || 20, total: p.total || 0, pages: p.pages || 1,
        };
        this.loading = false;
      },
      error: (err) => { this.error = err?.error?.message || 'Could not load disputes.'; this.loading = false; },
    });
  }

  onFilter(): void { this.pagination.page = 1; this.load(); }
  clearFilters(): void { this.statusFilter = ''; this.pagination.page = 1; this.load(); }
  changePage(p: number): void { if (p < 1 || p > this.pagination.pages) return; this.pagination.page = p; this.load(); }

  openDispute(d: any): void {
    this.actionMsg = '';
    this.svc.getById(d._id || d.id).subscribe({
      next: (res) => {
        this.selected  = res?.data || d;
        this.resolution = this.selected.resolution || '';
        this.note       = this.selected.resolutionNote || '';
      },
      error: () => { this.selected = d; },
    });
  }
  closeDetail(): void { this.selected = null; this.actionMsg = ''; }

  resolveDispute(): void {
    if (!this.resolution || this.actionBusy) return;
    this.actionBusy = true; this.actionMsg = '';
    this.svc.resolve(this.selected._id || this.selected.id, this.resolution as any, this.note).subscribe({
      next: (res) => {
        this.selected = res?.data || this.selected;
        this.actionBusy = false;
        this.actionMsg = 'Dispute resolved.';
        this.load();
      },
      error: (err) => { this.actionBusy = false; this.actionMsg = err?.error?.message || 'Could not resolve dispute.'; },
    });
  }

  statusClass(s: string): string {
    return { open: 'ds-open', under_review: 'ds-review', resolved: 'ds-resolved', closed: 'ds-closed' }[s] || 'ds-open';
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.selected) this.closeDetail(); }
}
