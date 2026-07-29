// src/app/admin/pages/notifications/notifications.component.ts
/**
 * Admin · Notifications — Rentify PK
 *  • Compose & send broadcast: Target (All / Renters / Owners), Title, Message
 *  • Sent history table (de-duplicated broadcasts + recipient count)
 *  APIs: POST /api/admin/notifications/announce, GET /notifications/history
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css'],
})
export class AdminNotificationsComponent implements OnInit {
  // Compose form
  target = '';        // '' = all, 'renter', 'owner'
  title = '';
  message = '';
  sending = signal(false);
  successMsg = signal('');

  // History
  history = signal<any[]>([]);
  historyLoading = signal(true);

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void { this.loadHistory(); }

  send(): void {
    if (!this.title.trim() || !this.message.trim()) {
      alert('Title and message are required.');
      return;
    }
    this.sending.set(true);
    this.successMsg.set('');
    this.adminSvc.sendAnnouncement({
      title: this.title.trim(),
      body: this.message.trim(),
      targetRole: this.target || undefined,
    }).subscribe({
      next: (res: any) => {
        this.successMsg.set(res.message || 'Sent successfully');
        this.title = ''; this.message = ''; this.target = '';
        this.sending.set(false);
        this.loadHistory();
      },
      error: () => { alert('Failed to send notification.'); this.sending.set(false); },
    });
  }

  loadHistory(): void {
    this.historyLoading.set(true);
    this.adminSvc.getAnnouncementHistory().subscribe({
      next: (res: any) => { this.history.set(res.data?.history || []); this.historyLoading.set(false); },
      error: () => this.historyLoading.set(false),
    });
  }

  targetLabel(role: string): string {
    if (!role || role === 'all') return 'All Users';
    return role.charAt(0).toUpperCase() + role.slice(1) + 's';
  }
}
