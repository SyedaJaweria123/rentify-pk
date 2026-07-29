import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { NotificationService } from './notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [
    CommonModule, DatePipe, RouterModule,
    MatButtonModule, MatIconModule, MatBadgeModule,
    MatMenuModule, MatProgressSpinnerModule, MatDividerModule,
  ],
  template: `
    <button type="button" [matMenuTriggerFor]="notifMenu" #trigger="matMenuTrigger" (click)="loadNotifications()" class="notif-bell-btn">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
      </svg>
      <span class="notif-count-badge" *ngIf="notifSvc.unreadCount() > 0">{{ notifSvc.unreadCount() }}</span>
    </button>

    <mat-menu #notifMenu="matMenu" class="notif-menu !min-w-96 !max-w-[420px] !p-0">
      <div class="nb-head" (click)="$event.stopPropagation()">
        <div class="nb-head-left">
          <span class="nb-bell-ic">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </span>
          <h3 class="nb-title">Notifications</h3>
        </div>
        <button class="nb-mark-read" *ngIf="notifSvc.unreadCount() > 0" (click)="markAllRead()">
          Mark all read
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>
        </button>
      </div>

      <div class="nb-list">
        @if (loading()) {
          <div class="flex justify-center p-8"><mat-spinner diameter="28"></mat-spinner></div>
        }

        @if (!loading() && notifications().length === 0) {
          <div class="nb-empty">
            <span class="nb-empty-ic">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </span>
            <p>No notifications yet</p>
          </div>
        }

        @for (notif of notifications(); track notif._id) {
          <div class="nb-item" [class.nb-item-unread]="!notif.isRead" (click)="onNotifClick(notif)">
            <span class="nb-ic" [ngClass]="iconTone(notif.type, notif.title)">
              <ng-container [ngSwitch]="iconKey(notif.type, notif.title)">
                <svg *ngSwitchCase="'rider'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9 17h5l3-6h-2l-2-3H7l2 5H6"/></svg>
                <svg *ngSwitchCase="'payment'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                <svg *ngSwitchCase="'document'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <svg *ngSwitchCase="'booking'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg>
                <svg *ngSwitchCase="'box'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
                <svg *ngSwitchCase="'message'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <svg *ngSwitchCase="'star'" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>
                <svg *ngSwitchCase="'shield'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <svg *ngSwitchCase="'alert'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <svg *ngSwitchCase="'support'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
                <svg *ngSwitchDefault width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </ng-container>
              <span class="nb-ic-badge"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
            </span>

            <div class="nb-body">
              <p class="nb-item-title">
                <span class="nb-dot" *ngIf="!notif.isRead"></span>
                {{ notif.title }}
              </p>
              <p class="nb-item-text">{{ notif.body }}</p>
              <p class="nb-item-time">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ notif.createdAt | date:'short' }}
              </p>
            </div>

            <svg class="nb-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        }
      </div>

      @if (notifications().length > 0) {
        <div class="nb-foot" (click)="$event.stopPropagation()">
          <a routerLink="/notifications" class="nb-view-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
            View all notifications
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>
      }
    </mat-menu>
  `,
  styles: [`
    .notif-bell-btn {
      position: relative; width: 40px; height: 40px; border-radius: 10px;
      border: 1.5px solid transparent; background: transparent; padding: 0; margin: 0;
      display: flex; align-items: center; justify-content: center; box-sizing: border-box;
      cursor: pointer; color: #6b7280; font: inherit;
      transition: background .18s, border-color .18s, color .18s, transform .18s;
      -webkit-tap-highlight-color: transparent; outline: none;
    }
    .notif-bell-btn:hover { background: #EAF3DE; border-color: #1F5435; color: #1F5435; transform: scale(1.08); }
    .notif-bell-btn:active { transform: scale(.96); }
    .notif-bell-btn:focus { outline: none; }
    .notif-count-badge {
      position: absolute; top: 4px; right: 4px;
      min-width: 16px; height: 16px; padding: 0 4px;
      background: #FF4D4D; color: #fff;
      font-size: 10px; font-weight: 700; line-height: 16px;
      border-radius: 999px; text-align: center;
      box-shadow: 0 0 0 2px var(--bg-surface, #fff);
    }

    /* ── Header ── */
    .nb-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 16px; border-bottom: 1px solid #f0f1ee; }
    .nb-head-left { display: flex; align-items: center; gap: 10px; }
    .nb-bell-ic { width: 34px; height: 34px; border-radius: 50%; background: #EAF3DE; color: #1F5435; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .nb-title { font-size: 17px; font-weight: 800; color: #1a1f1c; margin: 0; font-family: 'Sora','Poppins',sans-serif; }
    .nb-mark-read {
      display: flex; align-items: center; gap: 5px; background: none; border: none; cursor: pointer;
      font-size: 12.5px; font-weight: 700; color: #1F5435; font-family: inherit; padding: 0; white-space: nowrap;
      transition: opacity .15s;
    }
    .nb-mark-read:hover { opacity: .7; }

    /* ── List ── */
    .nb-list { max-height: 380px; overflow-y: auto; }
    .nb-item {
      display: flex; align-items: flex-start; gap: 12px; padding: 14px 20px;
      cursor: pointer; border-bottom: 1px solid #f5f6f3; transition: background .15s; position: relative;
    }
    .nb-item:hover { background: #fafaf8; }
    .nb-item-unread { background: #f2f5fb; border-left: 3px solid #4c5fd5; padding-left: 17px; }
    .nb-item-unread:hover { background: #edf1fa; }

    .nb-ic {
      width: 42px; height: 42px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; position: relative;
    }
    .nb-ic-badge {
      position: absolute; bottom: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%;
      background: #1F5435; display: flex; align-items: center; justify-content: center; border: 2px solid #fff;
    }
    .tone-rider   { background: #EAF3DE; color: #1F5435; }
    .tone-payment { background: #E4E9FB; color: #3949AB; }
    .tone-message { background: #E4E9FB; color: #3949AB; }
    .tone-booking { background: #FFF4E0; color: #B8720C; }
    .tone-alert   { background: #FDE7E7; color: #C0392B; }
    .tone-system  { background: #EFEFF3; color: #5B5F70; }
    .tone-rider .nb-ic-badge, .tone-payment .nb-ic-badge, .tone-message .nb-ic-badge { background: #1F5435; }
    .tone-booking .nb-ic-badge { background: #B8720C; }
    .tone-alert .nb-ic-badge   { background: #C0392B; }
    .tone-system .nb-ic-badge  { background: #5B5F70; }

    .nb-body { flex: 1; min-width: 0; }
    .nb-item-title { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 700; color: #1a1f1c; margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nb-dot { width: 6px; height: 6px; border-radius: 50%; background: #4c5fd5; flex-shrink: 0; }
    .nb-item-text { font-size: 12.5px; color: #6b7280; margin: 0 0 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .nb-item-time { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #9ca3af; margin: 0; }

    .nb-chevron { flex-shrink: 0; color: #c7cbc3; margin-top: 12px; }

    .nb-empty { text-align: center; padding: 44px 20px; color: #9ca3af; }
    .nb-empty-ic { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: #f5f6f3; color: #9ca3af; margin-bottom: 10px; }
    .nb-empty p { font-size: 13px; margin: 0; }

    /* ── Footer ── */
    .nb-foot { padding: 14px 20px; border-top: 1px solid #f0f1ee; }
    .nb-view-all {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      font-size: 13px; font-weight: 700; color: #1F5435; text-decoration: none; transition: opacity .15s;
    }
    .nb-view-all:hover { opacity: .75; }
  `],
})
export class NotificationBellComponent implements OnInit {
  notifications = signal<any[]>([]);
  loading       = signal(false);

  @ViewChild('trigger') menuTrigger?: MatMenuTrigger;

  constructor(public notifSvc: NotificationService, private router: Router) {}

  ngOnInit(): void {
    this.notifSvc.refreshCount();
  }

  loadNotifications(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.notifSvc.getAll(1, 15).subscribe({
      next: (res) => {
        this.notifications.set(res.data.notifications);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onNotifClick(notif: any): void {
    this.notifSvc.setSelected(notif);
    this.closeMenu();
    this.router.navigate(['/notifications', notif._id]);
  }

  /** Close the Material menu (so the next click works without a page change). */
  private closeMenu(): void {
    try { this.menuTrigger?.closeMenu(); } catch {}
  }

  markAllRead(): void {
    this.notifSvc.markAllRead().subscribe(() => {
      this.notifications.update(list => list.map(n => ({ ...n, isRead: true })));
    });
  }

  /** Pick an icon key for a notification, using its type first and falling
   *  back to keyword matches on the title (e.g. rider-acceptance notifications
   *  are stored with type 'system' on the backend, so we detect them by text). */
  iconKey(type: string, title?: string): string {
    const t = (title || '').toLowerCase();
    if (t.includes('rider'))                      return 'rider';
    if (type === 'support')                        return 'support';
    if (type.startsWith('booking'))                return 'booking';
    if (type.startsWith('payment') || type === 'withdrawal_processed') return 'payment';
    if (type.includes('review'))                   return 'star';
    if (type.includes('message'))                  return 'message';
    if (type.includes('dispute'))                  return 'alert';
    if (type.includes('cnic'))                     return 'shield';
    if (type.includes('listing'))                  return 'box';
    if (t.includes('payment') || t.includes('proof') || t.includes('paid')) return 'document';
    return 'bell';
  }

  iconTone(type: string, title?: string): string {
    const key = this.iconKey(type, title);
    if (key === 'rider')               return 'tone-rider';
    if (key === 'payment' || key === 'document') return 'tone-payment';
    if (key === 'message' || key === 'star')     return 'tone-message';
    if (key === 'booking')             return 'tone-booking';
    if (key === 'alert' || key === 'shield')     return 'tone-alert';
    return 'tone-system';
  }
}
