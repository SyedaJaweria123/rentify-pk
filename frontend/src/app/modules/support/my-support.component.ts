import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { UserSupportService } from './support.service';

@Component({
  selector: 'app-my-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe],
  templateUrl: './my-support.component.html',
  styleUrls: ['./my-support.component.css'],
})
export class MySupportComponent implements OnInit {

  tickets: any[] = [];
  pagination = { page: 1, limit: 10, total: 0, totalPages: 1, hasPrev: false, hasNext: false };
  loading = true;
  error = '';
  showTickets = false;

  search = '';
  statusFilter = '';
  sortOrder: 'latest' | 'oldest' = 'latest';
  private searchTimer: any = null;

  readonly statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];

  readonly popularTopics = [
    'How to book an item?',
    'How does the payment work?',
    'How to add listing?',
    'How to withdraw money?',
  ];

  faqResults:    any[]    = [];
  faqLoading:    boolean  = false;
  showFaqResults: boolean = false;

  openTopic(t: string): void {
    this.search = t;
    this.searchFaqs();
  }

  searchFaqs(): void {
    const q = this.search.trim();
    this.faqLoading    = true;
    this.showFaqResults = true;
    this.faqResults    = [];
    this.http.get<any>(`${environment.apiUrl}/support/faqs/search`, {
      params: { q }
    }).subscribe({
      next: (res) => { this.faqResults = res?.data || []; this.faqLoading = false; },
      error: ()    => { this.faqLoading = false; },
    });
  }

  constructor(
    private svc:  UserSupportService,
    private http: HttpClient,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Don't auto-load — user must click "My Tickets" card
    // this.load();
  }

  load(): void {
    this.loading = true; this.error = '';
    this.svc.myTickets({
      page:   this.pagination.page,
      limit:  this.pagination.limit,
      search: this.search.trim() || undefined,
      status: this.statusFilter || undefined,
      sort:   this.sortOrder,
    }).subscribe({
      next: (res) => {
        const d = res?.data || {};
        this.tickets    = d.tickets || [];
        this.pagination = d.pagination || this.pagination;
        this.loading = false;
      },
      error: (err) => {
        console.error('Support API error:', err.status, err.error);
        // If not logged in, show friendly message instead of error
        if (err.status === 401 || err.status === 403) {
          this.error = 'Please login to view your tickets.';
        } else {
          this.error = err?.error?.message || 'Could not load tickets. Error: ' + err.status;
        }
        this.loading = false;
      },
    });
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchFaqs();
    }, 350);
  }
  onFilter(): void { this.pagination.page = 1; this.load(); }
  clearFilters(): void { this.search = ''; this.statusFilter = ''; this.sortOrder = 'latest'; this.pagination.page = 1; this.load(); }
  changePage(p: number): void { if (p < 1 || p > this.pagination.totalPages) return; this.pagination.page = p; this.load(); }

  viewTicket(t: any): void { this.router.navigate(['/my-tickets', t.id]); }

  statusClass(s: string): string {
    return { 'Open': 'st-open', 'In Progress': 'st-prog', 'Resolved': 'st-res', 'Closed': 'st-closed' }[s] || 'st-open';
  }
}
