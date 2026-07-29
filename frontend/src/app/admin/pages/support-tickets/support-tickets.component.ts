import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupportService } from '../../services/support.service';

@Component({
  selector: 'app-admin-support-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './support-tickets.component.html',
  styleUrls: ['./support-tickets.component.css'],
})
export class AdminSupportTicketsComponent implements OnInit {

  tickets: any[] = [];
  stats = { open: 0, inProgress: 0, resolved: 0, total: 0 };
  pagination = { page: 1, limit: 10, total: 0, totalPages: 1, hasPrev: false, hasNext: false };
  loading = true;
  error = '';

  search = '';
  statusFilter = '';
  categoryFilter = '';
  private searchTimer: any = null;

  readonly statuses   = ['Open', 'In Progress', 'Resolved', 'Closed'];
  readonly categories = ['Property Issue', 'Payment Issue', 'Account Issue', 'Technical Issue', 'Other'];

  // Detail panel
  selected: any = null;
  detailLoading = false;
  replyText = '';
  replyStatus = '';
  noteText = '';
  actionBusy = false;
  actionMsg = '';

  constructor(private svc: SupportService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true; this.error = '';
    this.svc.listTickets({
      page: this.pagination.page, limit: this.pagination.limit,
      search: this.search, status: this.statusFilter, category: this.categoryFilter,
    }).subscribe({
      next: (res) => {
        const d = res?.data || {};
        this.tickets    = d.tickets || [];
        this.stats      = d.stats || this.stats;
        this.pagination = d.pagination || this.pagination;
        this.loading = false;
      },
      error: (err) => { this.error = err?.error?.message || 'Could not load tickets.'; this.loading = false; },
    });
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.pagination.page = 1; this.load(); }, 400);
  }
  onFilter(): void { this.pagination.page = 1; this.load(); }
  clearFilters(): void { this.search = ''; this.statusFilter = ''; this.categoryFilter = ''; this.pagination.page = 1; this.load(); }
  changePage(p: number): void { if (p < 1 || p > this.pagination.totalPages) return; this.pagination.page = p; this.load(); }

  openTicket(t: any): void {
    this.detailLoading = true; this.actionMsg = '';
    this.svc.getTicket(t.id).subscribe({
      next: (res) => {
        this.selected = res?.data || t;
        this.replyText = this.selected.adminReply || '';
        this.replyStatus = this.selected.status;
        this.noteText = this.selected.internalNotes || '';
        this.detailLoading = false;
      },
      error: () => { this.selected = t; this.detailLoading = false; },
    });
  }
  closeDetail(): void { this.selected = null; this.actionMsg = ''; }

  sendReply(): void {
    if (!this.replyText.trim() || this.actionBusy) return;
    this.actionBusy = true; this.actionMsg = '';
    this.svc.reply(this.selected.id, this.replyText.trim(), this.replyStatus).subscribe({
      next: (res) => {
        this.selected = res?.data || this.selected;
        this.actionBusy = false;
        this.actionMsg = 'Reply sent to user by email.';
        this.load();
      },
      error: (err) => { this.actionBusy = false; this.actionMsg = err?.error?.message || 'Could not send reply.'; },
    });
  }

  saveStatus(): void {
    if (this.actionBusy) return;
    this.actionBusy = true; this.actionMsg = '';
    this.svc.updateStatus(this.selected.id, this.replyStatus, this.noteText).subscribe({
      next: (res) => {
        this.selected = res?.data || this.selected;
        this.actionBusy = false;
        this.actionMsg = 'Status updated.';
        this.load();
      },
      error: (err) => { this.actionBusy = false; this.actionMsg = err?.error?.message || 'Could not update status.'; },
    });
  }

  statusClass(s: string): string {
    return { 'Open': 'st-open', 'In Progress': 'st-prog', 'Resolved': 'st-res', 'Closed': 'st-closed' }[s] || 'st-open';
  }
  isPdf(url: string): boolean { return /\.pdf($|\?)/i.test(url || ''); }

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.selected) this.closeDetail(); }
}
