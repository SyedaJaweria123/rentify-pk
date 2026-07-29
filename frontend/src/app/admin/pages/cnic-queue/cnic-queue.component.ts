// src/app/admin/pages/cnic-queue/cnic-queue.component.ts
/**
 * AdminCnicQueueComponent — Rentify PK admin
 * Route: /admin/cnic-queue
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists pending CNIC submissions as review cards. For each user the admin can:
 *   • View CNIC front, back, and selfie images (click to zoom in a lightbox)
 *   • Approve   → POST /cnic/admin/verify  { userId }
 *   • Reject    → POST /cnic/admin/reject  { userId, reason }
 *
 * Data: GET /cnic/admin/queue  (returns image URLs added in the backend update).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CnicAdminService } from '../../services/cnic-admin.service';

@Component({
  selector:   'app-admin-cnic-queue',
  standalone: true,
  imports:    [CommonModule, FormsModule],
  template: `
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">CNIC Verification Queue</h1>
        <p class="page-subtitle">Review and approve pending identity verifications</p>
      </div>
      <button class="btn-refresh" (click)="load()">🔄 Refresh</button>
    </div>

    <!-- Inline feedback -->
    <div class="msg" *ngIf="message()" [class.msg-ok]="msgType()==='ok'" [class.msg-err]="msgType()==='err'">
      {{ message() }}
    </div>

    <!-- Loading -->
    <div class="state" *ngIf="loading()">
      <div class="spin"></div><p>Loading queue…</p>
    </div>

    <!-- Empty -->
    <div class="state" *ngIf="!loading() && queue().length === 0">
      <span class="state-icon">✅</span>
      <p class="state-title">All caught up!</p>
      <p class="state-sub">No pending CNIC verifications right now.</p>
    </div>

    <!-- Queue cards -->
    <div class="queue-grid" *ngIf="!loading() && queue().length > 0">
      <div class="cnic-card" *ngFor="let u of queue()">

        <!-- User header -->
        <div class="card-head">
          <div class="avatar">{{ (u.name || 'U').charAt(0).toUpperCase() }}</div>
          <div class="who">
            <div class="who-name">{{ u.name }}</div>
            <div class="who-email">{{ u.email }}</div>
          </div>
          <span class="score" *ngIf="u.cnicValidationScore"
                [class.score-warn]="u.cnicValidationScore < 80">
            {{ u.cnicValidationScore >= 80 ? '✓ Format Valid' : '⚠ Check Format' }}
          </span>
        </div>

        <!-- CNIC meta -->
        <div class="meta">
          <div class="meta-row"><span>CNIC #</span><strong>{{ u.cnicNumber }}</strong></div>
          <div class="meta-row" *ngIf="u.cnicProvince"><span>Province</span><strong>{{ u.cnicProvince }}</strong></div>
          <div class="meta-row" *ngIf="u.cnicGender"><span>Gender</span><strong>{{ u.cnicGender }}</strong></div>
          <div class="meta-row" *ngIf="u.phone"><span>Phone</span><strong>{{ u.phone }}</strong></div>
          <div class="meta-row" *ngIf="u.cnicSubmittedAt"><span>Submitted</span><strong>{{ u.cnicSubmittedAt | date:'dd MMM, hh:mm a' }}</strong></div>
        </div>

        <!-- Images -->
        <div class="imgs">
          <div class="img-slot" *ngIf="u.cnicImageFront" (click)="zoom(u.cnicImageFront)">
            <img [src]="u.cnicImageFront" alt="CNIC front"/>
            <span>Front</span>
          </div>
          <div class="img-slot" *ngIf="u.cnicImageBack" (click)="zoom(u.cnicImageBack)">
            <img [src]="u.cnicImageBack" alt="CNIC back"/>
            <span>Back</span>
          </div>
          <div class="img-slot" *ngIf="u.cnicSelfie" (click)="zoom(u.cnicSelfie)">
            <img [src]="u.cnicSelfie" alt="Selfie"/>
            <span>Selfie</span>
          </div>
          <div class="no-imgs" *ngIf="!u.cnicImageFront && !u.cnicImageBack && !u.cnicSelfie">
            ⚠️ No images uploaded
          </div>
        </div>

        <!-- Actions -->
        <div class="actions">
          <button class="btn-approve" [disabled]="acting()===u._id" (click)="approve(u)">✓ Approve</button>
          <button class="btn-reject"  [disabled]="acting()===u._id" (click)="openReject(u)">✗ Reject</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Image lightbox -->
  <div class="lightbox" *ngIf="zoomImg()" (click)="zoomImg.set(null)">
    <img [src]="zoomImg()" alt="CNIC zoom"/>
  </div>

  <!-- Reject reason modal -->
  <div class="modal-bg" *ngIf="rejectUser()" (click)="rejectUser.set(null)">
    <div class="modal" (click)="$event.stopPropagation()">
      <h3>Reject CNIC</h3>
      <p>Rejecting <strong>{{ rejectUser()?.name }}</strong>'s verification. Give a clear reason:</p>
      <textarea [(ngModel)]="rejectReason" rows="3"
        placeholder="e.g. CNIC image is blurry / details don't match / selfie unclear"></textarea>
      <div class="modal-btns">
        <button class="btn-ghost" (click)="rejectUser.set(null)">Cancel</button>
        <button class="btn-reject" [disabled]="!rejectReason.trim()" (click)="confirmReject()">Confirm Reject</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { --green:#1F5435; --green-d:#008C44; --green-l:#E8F8EF; --red:#ef4444;
            --text:#1A1D1F; --text-2:#6F767E; --border:#e2e8f0; --surface:#f8fafc; display:block; }
    .page { padding:0; }
    .page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem; }
    .page-title { font-size:1.5rem; font-weight:800; color:var(--text); }
    .page-subtitle { font-size:.875rem; color:var(--text-2); margin-top:2px; }
    .btn-refresh { padding:.5rem 1rem; border:1px solid var(--border); border-radius:8px; background:#fff;
                   font-size:.8125rem; font-weight:600; cursor:pointer; }
    .btn-refresh:hover { border-color:var(--green); color:var(--green); }

    .msg { padding:.75rem 1rem; border-radius:10px; font-size:.85rem; font-weight:600; margin-bottom:1rem; }
    .msg-ok  { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; }
    .msg-err { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }

    .state { text-align:center; padding:3rem; color:var(--text-2); }
    .state-icon { font-size:2.5rem; display:block; margin-bottom:.5rem; }
    .state-title { font-size:1.05rem; font-weight:700; }
    .state-sub { font-size:.85rem; }
    .spin { width:28px; height:28px; border:3px solid var(--border); border-top-color:var(--green);
            border-radius:50%; animation:sp .7s linear infinite; margin:0 auto .75rem; }
    @keyframes sp { to { transform:rotate(360deg); } }

    .queue-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:1.25rem; }
    .cnic-card { background:#fff; border:1px solid var(--border); border-radius:16px; padding:1.25rem;
                 box-shadow:0 2px 12px rgba(0,0,0,.05); }

    .card-head { display:flex; align-items:center; gap:.75rem; margin-bottom:1rem; }
    .avatar { width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,var(--green),#00CC66);
              color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center; }
    .who { flex:1; min-width:0; }
    .who-name { font-weight:700; font-size:.95rem; }
    .who-email { font-size:.8rem; color:var(--text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .score { font-size:.7rem; font-weight:700; color:var(--green-d); background:var(--green-l);
             padding:3px 8px; border-radius:999px; }
    .score-warn { color:#B45309; background:#FEF3C7; }

    .meta { background:var(--surface); border-radius:10px; padding:.75rem; margin-bottom:1rem; }
    .meta-row { display:flex; justify-content:space-between; font-size:.8rem; padding:2px 0; }
    .meta-row span { color:var(--text-2); }
    .meta-row strong { color:var(--text); }

    .imgs { display:grid; grid-template-columns:repeat(3,1fr); gap:.5rem; margin-bottom:1rem; }
    .img-slot { cursor:pointer; }
    .img-slot img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; border:1px solid var(--border);
                    transition:transform .15s; }
    .img-slot:hover img { transform:scale(1.04); border-color:var(--green); }
    .img-slot span { display:block; text-align:center; font-size:.7rem; color:var(--text-2); margin-top:3px; }
    .no-imgs { grid-column:1/-1; text-align:center; font-size:.8rem; color:#d97706; background:#fffbeb;
               border-radius:8px; padding:.75rem; }

    .actions { display:flex; gap:.5rem; }
    .btn-approve, .btn-reject { flex:1; padding:.6rem; border:none; border-radius:9px; font-size:.85rem;
                                font-weight:700; cursor:pointer; }
    .btn-approve { background:var(--green); color:#fff; }
    .btn-approve:hover:not(:disabled) { background:var(--green-d); }
    .btn-reject  { background:#fef2f2; color:var(--red); border:1px solid #fecaca; }
    .btn-reject:hover:not(:disabled) { background:#fee2e2; }
    button:disabled { opacity:.5; cursor:not-allowed; }

    /* Lightbox */
    .lightbox { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.85);
                display:flex; align-items:center; justify-content:center; padding:2rem; cursor:zoom-out; }
    .lightbox img { max-width:90%; max-height:90%; border-radius:12px; }

    /* Reject modal */
    .modal-bg { position:fixed; inset:0; z-index:1001; background:rgba(13,27,42,.6); backdrop-filter:blur(3px);
                display:flex; align-items:center; justify-content:center; padding:1rem; }
    .modal { background:#fff; border-radius:16px; padding:1.5rem; max-width:420px; width:100%; }
    .modal h3 { font-size:1.15rem; font-weight:800; margin-bottom:.5rem; }
    .modal p { font-size:.85rem; color:var(--text-2); margin-bottom:1rem; }
    .modal textarea { width:100%; border:1.5px solid var(--border); border-radius:10px; padding:.75rem;
                      font-family:inherit; font-size:.875rem; resize:vertical; outline:none; box-sizing:border-box; }
    .modal textarea:focus { border-color:var(--red); }
    .modal-btns { display:flex; gap:.75rem; margin-top:1rem; }
    .btn-ghost { flex:1; padding:.7rem; border:1.5px solid var(--border); border-radius:9px; background:#fff;
                 font-weight:700; cursor:pointer; }
    .modal-btns .btn-reject { flex:1; }
  `],
})
export class AdminCnicQueueComponent implements OnInit {
  queue   = signal<any[]>([]);
  loading = signal(true);
  acting  = signal<string | null>(null);    // userId currently being acted on
  message = signal<string | null>(null);
  msgType = signal<'ok' | 'err'>('ok');

  zoomImg    = signal<string | null>(null);  // lightbox image URL
  rejectUser = signal<any | null>(null);     // user being rejected
  rejectReason = '';

  constructor(private cnicSvc: CnicAdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.cnicSvc.getQueue().subscribe({
      next: (res: any) => { this.queue.set(res.data || []); this.loading.set(false); },
      error: () => { this.queue.set([]); this.loading.set(false); },
    });
  }

  zoom(url: string): void { this.zoomImg.set(url); }

  approve(u: any): void {
    this.acting.set(u._id);
    this.cnicSvc.verify(u._id).subscribe({
      next: () => { this.acting.set(null); this.flash(`${u.name} verified ✓`, 'ok'); this.removeFromQueue(u._id); },
      error: (e) => { this.acting.set(null); this.flash(e.error?.message || 'Approve failed', 'err'); },
    });
  }

  openReject(u: any): void { this.rejectUser.set(u); this.rejectReason = ''; }

  confirmReject(): void {
    const u = this.rejectUser();
    if (!u || !this.rejectReason.trim()) return;
    this.acting.set(u._id);
    this.cnicSvc.reject(u._id, this.rejectReason.trim()).subscribe({
      next: () => {
        this.acting.set(null);
        this.flash(`${u.name} rejected`, 'ok');
        this.removeFromQueue(u._id);
        this.rejectUser.set(null);
      },
      error: (e) => { this.acting.set(null); this.flash(e.error?.message || 'Reject failed', 'err'); },
    });
  }

  private removeFromQueue(userId: string): void {
    this.queue.update(list => list.filter(u => u._id !== userId));
  }

  private flash(msg: string, type: 'ok' | 'err'): void {
    this.message.set(msg); this.msgType.set(type);
    setTimeout(() => this.message.set(null), 3500);
  }
}
