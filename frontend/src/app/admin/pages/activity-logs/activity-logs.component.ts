// src/app/admin/pages/activity-logs/activity-logs.component.ts
/**
 * Admin · Activity Logs — Rentify PK
 *  • Table: Timestamp | User | Action | Target | Details
 *  • Action-type + text filter (client-side), pagination (load more)
 *  API: GET /api/admin/activity  (returns recent platform activity feed)
 *
 *  NOTE: This is an activity *feed* (recent bookings / events), not a full
 *  admin audit trail with IPs — the backend does not record per-admin-action
 *  audit logs yet, so IP is shown as "—". A true audit log would require
 *  logging middleware on every admin mutation.
 */
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-activity-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './activity-logs.component.html',
  styleUrls: ['./activity-logs.component.css'],
})
export class AdminActivityLogsComponent implements OnInit {
  allLogs = signal<any[]>([]);
  loading = signal(true);
  error   = signal('');

  search = '';
  actionFilter = '';
  visibleCount = signal(15);   // "load more" pagination

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminSvc.getActivityLogs({ limit: 100 }).subscribe({
      next: (res: any) => {
        this.allLogs.set(res.data?.activities || []);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load activity logs.'); this.loading.set(false); },
    });
  }

  // Distinct action types for the filter dropdown
  actionTypes = computed(() => {
    const set = new Set(this.allLogs().map(l => l.action).filter(Boolean));
    return Array.from(set);
  });

  // Filtered + sliced (pagination) list shown in the table
  filtered = computed(() => {
    const s = this.search.toLowerCase();
    return this.allLogs().filter(l => {
      const matchAction = !this.actionFilter || l.action === this.actionFilter;
      const matchText = !s ||
        (l.user || '').toLowerCase().includes(s) ||
        (l.entity || '').toLowerCase().includes(s) ||
        (l.details || '').toLowerCase().includes(s);
      return matchAction && matchText;
    });
  });

  visible = computed(() => this.filtered().slice(0, this.visibleCount()));

  loadMore(): void { this.visibleCount.update(v => v + 15); }
  onFilterChange(): void { this.visibleCount.set(15); }
}
