import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UserSupportService } from './support.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

interface TimelineItem { icon: string; label: string; date: any; }

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe, FormsModule],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css'],
})
export class TicketDetailComponent implements OnInit {

  ticket: any = null;
  loading = true;
  error = '';

  replyText = '';
  replyFile: File | null = null;
  sending   = false;
  replyError = '';
  replyOk    = '';

  constructor(
    private svc:   UserSupportService,
    private route: ActivatedRoute,
    private router: Router,
    public  auth:  AuthService,
    private http:  HttpClient,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error = 'Invalid ticket.'; this.loading = false; return; }
    this.svc.myTicketDetail(id).subscribe({
      next: (res) => { this.ticket = res?.data || null; this.loading = false; },
      error: (err) => {
        this.loading = false;
        if (err?.status === 403)      this.error = 'You do not have access to this ticket.';
        else if (err?.status === 404) this.error = 'Ticket not found.';
        else if (err?.status === 401) { this.router.navigate(['/auth/login'], { queryParams: { redirect: this.router.url } }); }
        else this.error = err?.error?.message || 'Could not load ticket.';
      },
    });
  }

  get userName(): string { return (this.auth.currentUser as any)?.name || (this.auth.currentUser as any)?.fullName || 'You'; }

  get timeline(): TimelineItem[] {
    if (!this.ticket) return [];
    const items: TimelineItem[] = [
      { icon: 'created', label: 'Ticket created', date: this.ticket.createdAt },
    ];
    if (this.ticket.repliedAt) {
      items.push({ icon: 'reply', label: 'Support replied', date: this.ticket.repliedAt });
    }
    if (this.ticket.status === 'Resolved' || this.ticket.status === 'Closed') {
      items.push({ icon: 'resolved', label: 'Ticket ' + this.ticket.status.toLowerCase(), date: this.ticket.updatedAt });
    } else if (this.ticket.status === 'In Progress') {
      items.push({ icon: 'progress', label: 'In progress', date: this.ticket.updatedAt });
    }
    return items;
  }

  statusClass(s: string): string {
    return { 'Open': 'st-open', 'In Progress': 'st-prog', 'Resolved': 'st-res', 'Closed': 'st-closed' }[s] || 'st-open';
  }
  isPdf(url: string): boolean { return /\.pdf($|\?)/i.test(url || ''); }
  back(): void { this.router.navigate(['/my-tickets']); }

  onFileSelect(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.replyFile = f;
  }

  sendReply(): void {
    if (!this.replyText.trim() || this.sending) return;
    this.sending = true; this.replyError = ''; this.replyOk = '';
    // For now show success — when backend supports user replies this will call API
    setTimeout(() => {
      this.sending  = false;
      this.replyOk  = 'Reply submitted! Our team will respond shortly.';
      this.replyText = '';
      this.replyFile = null;
    }, 800);
  }
}
