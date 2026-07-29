// src/app/admin/pages/contact-messages/contact-messages.component.ts
/**
 * Admin · Contact Messages — Rentify PK
 * Lists messages submitted via the public Contact Us form (saved to MongoDB),
 * with unread highlighting, expand-to-read, mark read/unread, and delete.
 * Forest-green admin theme. Real data via AdminService.
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AdminService } from '../../services/admin.service';

interface CMsg {
  _id: string; name: string; email: string; subject: string; message: string;
  isRead: boolean; createdAt: string;
}

@Component({
  selector: 'app-admin-contact-messages',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
  <div class="pg">
    <div class="pg-head">
      <div>
        <p class="pg-eyebrow">Inbox</p>
        <h1 class="pg-title">Contact Messages</h1>
        <p class="pg-sub">Messages sent through the public Contact Us form.</p>
      </div>
      <div class="pg-count" *ngIf="!loading()">
        <b>{{ unread() }}</b> unread · {{ messages().length }} total
      </div>
    </div>

    <div class="loading" *ngIf="loading()">Loading messages…</div>

    <div class="empty" *ngIf="!loading() && messages().length === 0">
      <div class="empty-ic">📭</div>
      <p>No messages yet. New Contact Us submissions will appear here.</p>
    </div>

    <div class="list" *ngIf="!loading() && messages().length > 0">
      <div class="msg" *ngFor="let m of messages()" [class.unread]="!m.isRead" [class.open]="expanded() === m._id">
        <div class="msg-main" (click)="toggle(m)">
          <span class="msg-dot" *ngIf="!m.isRead"></span>
          <div class="msg-who">
            <p class="msg-name">{{ m.name }} <span class="msg-subj">· {{ m.subject }}</span></p>
            <p class="msg-email">{{ m.email }}</p>
          </div>
          <p class="msg-preview">{{ m.message }}</p>
          <span class="msg-date">{{ m.createdAt | date:'MMM d, y · h:mm a' }}</span>
        </div>

        <div class="msg-body" *ngIf="expanded() === m._id">
          <p class="msg-full">{{ m.message }}</p>
          <div class="msg-actions">
            <a class="mbtn reply" [href]="'mailto:' + m.email + '?subject=Re: ' + m.subject">Reply by email</a>
            <button class="mbtn" (click)="toggleRead(m); $event.stopPropagation()">{{ m.isRead ? 'Mark unread' : 'Mark read' }}</button>
            <button class="mbtn danger" (click)="remove(m); $event.stopPropagation()">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { display: block; --brand:#1F5435; --brand-d:#143524; --mint:#EAF3DE; --ink:#143524; --ink-2:#5a6b5e; --ink-3:#8b988e; --line:#e6efe6; --surface:#f4f8f4; }
    .pg { padding: 26px; }
    .pg-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; }
    .pg-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--brand); margin: 0 0 4px; }
    .pg-title { font-size: 26px; font-weight: 900; color: var(--ink); margin: 0; }
    .pg-sub { font-size: 14px; color: var(--ink-2); margin: 6px 0 0; }
    .pg-count { font-size: 13px; color: var(--ink-2); white-space: nowrap; }
    .pg-count b { color: var(--brand); font-weight: 900; }

    .loading, .empty { text-align: center; color: var(--ink-3); padding: 50px 20px; font-size: 14px; }
    .empty-ic { font-size: 42px; margin-bottom: 10px; }

    .list { display: flex; flex-direction: column; gap: 12px; }
    .msg { background: #fff; border: 1.5px solid var(--line); border-radius: 14px; overflow: hidden; transition: box-shadow .2s, border-color .2s; }
    .msg:hover { box-shadow: 0 10px 26px rgba(31,84,45,.08); }
    .msg.unread { border-color: #cfe6d6; background: #fbfefb; }
    .msg.open { box-shadow: 0 12px 30px rgba(31,84,45,.12); }

    .msg-main { display: grid; grid-template-columns: 16px 220px 1fr auto; gap: 14px; align-items: center; padding: 16px 18px; cursor: pointer; }
    @media (max-width: 760px) { .msg-main { grid-template-columns: 12px 1fr; } .msg-preview, .msg-date { display: none; } }
    .msg-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); }
    .msg-who { min-width: 0; }
    .msg-name { font-size: 14.5px; font-weight: 800; color: var(--ink); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .msg-subj { font-weight: 600; color: var(--ink-2); font-size: 13px; }
    .msg-email { font-size: 12.5px; color: var(--ink-3); margin: 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .msg-preview { font-size: 13.5px; color: var(--ink-2); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .msg-date { font-size: 12px; color: var(--ink-3); white-space: nowrap; }
    .msg.unread .msg-name { color: var(--brand-d); }

    .msg-body { padding: 4px 18px 18px 48px; border-top: 1px solid var(--line); }
    .msg-full { font-size: 14px; color: var(--ink); line-height: 1.65; white-space: pre-wrap; margin: 14px 0 16px; }
    .msg-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .mbtn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 9px; border: 1.5px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; transition: all .18s; }
    .mbtn:hover { border-color: var(--brand); color: var(--brand); background: var(--mint); }
    .mbtn.reply { background: var(--brand); color: #fff; border-color: var(--brand); }
    .mbtn.reply:hover { background: var(--brand-d); color: #fff; }
    .mbtn.danger:hover { border-color: #dc2626; color: #dc2626; background: #fef2f2; }

    :host-context([data-theme="dark"]) .pg-title, :host-context([data-theme="dark"]) .msg-name, :host-context([data-theme="dark"]) .msg-full { color: #D8E8F2; }
    :host-context([data-theme="dark"]) .msg { background: #132236; border-color: #1C3148; }
    :host-context([data-theme="dark"]) .msg.unread { background: #16283c; }
  `],
})
export class AdminContactMessagesComponent implements OnInit {
  messages = signal<CMsg[]>([]);
  unread = signal(0);
  loading = signal(true);
  expanded = signal<string | null>(null);

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.adminSvc.getContactMessages().subscribe({
      next: (res: any) => {
        this.messages.set(res?.data?.messages || []);
        this.unread.set(res?.data?.unread || 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggle(m: CMsg): void {
    if (this.expanded() === m._id) { this.expanded.set(null); return; }
    this.expanded.set(m._id);
    if (!m.isRead) this.setRead(m, true);   // auto-mark read on open
  }

  toggleRead(m: CMsg): void { this.setRead(m, !m.isRead); }

  private setRead(m: CMsg, isRead: boolean): void {
    this.adminSvc.markContactMessageRead(m._id, isRead).subscribe({
      next: () => {
        m.isRead = isRead;
        this.messages.set([...this.messages()]);
        this.unread.set(this.messages().filter(x => !x.isRead).length);
      },
      error: () => {},
    });
  }

  remove(m: CMsg): void {
    this.adminSvc.deleteContactMessage(m._id).subscribe({
      next: () => {
        this.messages.set(this.messages().filter(x => x._id !== m._id));
        this.unread.set(this.messages().filter(x => !x.isRead).length);
      },
      error: () => {},
    });
  }
}