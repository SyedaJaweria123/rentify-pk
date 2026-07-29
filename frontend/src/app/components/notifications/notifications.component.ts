import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  time: Date;
  read: boolean;
  icon: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="notif-wrapper">
  <button class="notif-bell" (click)="togglePanel()" [class.has-unread]="unreadCount > 0">
    🔔
    <span class="notif-badge" *ngIf="unreadCount > 0">{{ unreadCount }}</span>
  </button>

  <div class="notif-panel" [class.open]="isOpen">
    <div class="notif-header">
      <span class="notif-title">🔔 Notifications</span>
      <button class="mark-all" (click)="markAllRead()" *ngIf="unreadCount > 0">Mark all read</button>
    </div>

    <div class="notif-list">
      <div *ngIf="notifications.length === 0" class="notif-empty">
        <span>📭</span><p>No notifications yet</p>
      </div>
      <div *ngFor="let n of notifications" class="notif-item" [class.unread]="!n.read" (click)="markRead(n)">
        <div class="notif-icon" [class]="'icon-' + n.type">{{ n.icon }}</div>
        <div class="notif-body">
          <div class="notif-item-title">{{ n.title }}</div>
          <div class="notif-item-msg">{{ n.message }}</div>
          <div class="notif-time">{{ timeAgo(n.time) }}</div>
        </div>
        <div class="unread-dot" *ngIf="!n.read"></div>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .notif-wrapper { position:relative; }
    .notif-bell { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); color:#f1f5f9; width:38px; height:38px; border-radius:10px; font-size:18px; display:flex; align-items:center; justify-content:center; position:relative; transition:all .2s; }
    .notif-bell:hover { background:rgba(255,255,255,.1); }
    .notif-bell.has-unread { border-color:rgba(99,102,241,.4); }
    .notif-badge { position:absolute; top:-6px; right:-6px; background:#ef4444; color:#fff; font-size:10px; font-weight:700; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #0a0a0f; }
    .notif-panel { position:absolute; top:48px; right:0; width:320px; background:#0f1623; border:1px solid rgba(255,255,255,.1); border-radius:14px; box-shadow:0 20px 60px rgba(0,0,0,.5); overflow:hidden; opacity:0; transform:translateY(-8px) scale(.97); pointer-events:none; transition:all .2s; z-index:1000; }
    .notif-panel.open { opacity:1; transform:translateY(0) scale(1); pointer-events:all; }
    .notif-header { padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.06); display:flex; justify-content:space-between; align-items:center; }
    .notif-title { color:#f1f5f9; font-size:14px; font-weight:600; }
    .mark-all { background:none; border:none; color:#6366f1; font-size:12px; }
    .mark-all:hover { color:#a78bfa; }
    .notif-list { max-height:320px; overflow-y:auto; }
    .notif-empty { text-align:center; padding:32px; color:#475569; }
    .notif-empty span { font-size:36px; display:block; margin-bottom:8px; }
    .notif-empty p { font-size:13px; }
    .notif-item { display:flex; align-items:flex-start; gap:12px; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,.04); cursor:pointer; transition:background .2s; position:relative; }
    .notif-item:hover { background:rgba(255,255,255,.03); }
    .notif-item.unread { background:rgba(99,102,241,.04); }
    .notif-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
    .icon-success { background:rgba(34,197,94,.15); }
    .icon-info { background:rgba(59,130,246,.15); }
    .icon-warning { background:rgba(245,158,11,.15); }
    .icon-error { background:rgba(239,68,68,.15); }
    .notif-body { flex:1; }
    .notif-item-title { color:#f1f5f9; font-size:13px; font-weight:500; margin-bottom:3px; }
    .notif-item-msg { color:#64748b; font-size:12px; line-height:1.5; }
    .notif-time { color:#334155; font-size:11px; margin-top:4px; }
    .unread-dot { width:8px; height:8px; background:#6366f1; border-radius:50%; flex-shrink:0; margin-top:4px; }
  `]
})
export class NotificationsComponent implements OnInit {
  isOpen = false;
  notifications: Notification[] = [];

  get unreadCount() { return this.notifications.filter(n => !n.read).length; }

  ngOnInit() {
    // Sample notifications — in real app these come from backend
    this.notifications = [
      { id:'1', type:'success', icon:'✅', title:'Email Verified', message:'Aapki email successfully verify ho gayi!', time: new Date(Date.now()-5*60*1000), read:false },
      { id:'2', type:'info',    icon:'🏠', title:'Welcome to RentAnything!', message:'Account create karne ke liye shukriya. Items browse karein!', time: new Date(Date.now()-10*60*1000), read:false },
      { id:'3', type:'warning', icon:'🪪', title:'CNIC Pending', message:'Aapki CNIC verification pending hai. 24-48 ghante mein complete hogi.', time: new Date(Date.now()-30*60*1000), read:true },
    ];
  }

  togglePanel() { this.isOpen = !this.isOpen; }

  markRead(n: Notification) { n.read = true; }

  markAllRead() { this.notifications.forEach(n => n.read = true); }

  timeAgo(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
    return `${Math.floor(diff/86400)} days ago`;
  }
}
