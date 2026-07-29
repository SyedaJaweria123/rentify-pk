// src/app/admin/pages/users/users.component.ts
/**
 * Admin · Users Management — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Table: Avatar | Name | Email | Role | CNIC | Joined | Status | Actions
 *  • Search (name/email, debounced) + Role filter + Status filter
 *  • Pagination (10/page) — server-side via GET /api/admin/users
 *  • Actions: Ban/Unban (suspend/unsuspend), Delete  (confirm dialogs)
 *  • Row click → detail modal (bookings/listings/wallet/reviews counts)
 *  All data from AdminService → real API. No mock data.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css'],
})
export class AdminUsersComponent implements OnInit {
  // ── Table state ───────────────────────────────────────────────────────────
  users    = signal<any[]>([]);
  loading  = signal(true);
  error    = signal('');

  // ── Filters / paging (sent to the API) ──────────────────────────────────────
  search = '';
  role   = '';        // '' | renter | owner
  status = '';        // '' | active | suspended
  page   = 1;
  limit  = 10;
  total  = signal(0);

  totalPages = signal(1);
  private searchSubject = new Subject<void>();

  // ── Detail modal ─────────────────────────────────────────────────────────────
  showModal  = signal(false);
  modalUser  = signal<any>(null);
  modalStats = signal<any>(null);
  modalLoading = signal(false);

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void {
    // Debounce typing so we don't hammer the API on every keystroke
    this.searchSubject.pipe(debounceTime(400)).subscribe(() => { this.page = 1; this.load(); });
    this.load();
  }

  // ── Load users from the API ──────────────────────────────────────────────────
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminSvc.getUsers({
      page: this.page, limit: this.limit,
      search: this.search, role: this.role, status: this.status,
    }).subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.users.set(d.users || []);
        this.total.set(d.total || 0);
        this.totalPages.set(Math.max(1, Math.ceil((d.total || 0) / this.limit)));
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load users.'); this.loading.set(false); },
    });
  }

  onSearch(): void { this.searchSubject.next(); }
  onFilterChange(): void { this.page = 1; this.load(); }

  // ── Pagination ───────────────────────────────────────────────────────────────
  prevPage(): void { if (this.page > 1) { this.page--; this.load(); } }
  nextPage(): void { if (this.page < this.totalPages()) { this.page++; this.load(); } }

  // ── Helpers for the template ─────────────────────────────────────────────────
  initial(u: any): string { return (u?.name || 'U').charAt(0).toUpperCase(); }
  isBanned(u: any): boolean { return !!u?.isSuspended; }
  cnicLabel(u: any): string {
    if (u?.cnicVerified) return 'Verified';
    if (u?.cnicRejected) return 'Rejected';
    if (u?.cnicNumber)   return 'Pending';
    return 'None';
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  toggleBan(u: any, event: Event): void {
    event.stopPropagation();
    if (this.isBanned(u)) {
      if (!confirm(`Unban ${u.name}?`)) return;
      this.adminSvc.unsuspendUser(u._id).subscribe({
        next: () => { u.isSuspended = false; },
        error: () => alert('Failed to unban user.'),
      });
    } else {
      const reason = prompt(`Reason for banning ${u.name}?`, 'Violation of terms');
      if (reason === null) return;
      this.adminSvc.suspendUser(u._id, reason).subscribe({
        next: () => { u.isSuspended = true; },
        error: () => alert('Failed to ban user.'),
      });
    }
  }

  deleteUser(u: any, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    this.adminSvc.deleteUser(u._id).subscribe({
      next: () => this.users.update(list => list.filter(x => x._id !== u._id)),
      error: () => alert('Failed to delete user.'),
    });
  }

  // ── Detail modal ─────────────────────────────────────────────────────────────
  openDetail(u: any): void {
    this.showModal.set(true);
    this.modalUser.set(u);
    this.modalStats.set(null);
    this.modalLoading.set(true);
    this.adminSvc.getUserById(u._id).subscribe({
      next: (res: any) => {
        this.modalUser.set(res.data?.user || u);
        this.modalStats.set(res.data?.stats || null);
        this.modalLoading.set(false);
      },
      error: () => this.modalLoading.set(false),
    });
  }
  closeModal(): void { this.showModal.set(false); }
}
