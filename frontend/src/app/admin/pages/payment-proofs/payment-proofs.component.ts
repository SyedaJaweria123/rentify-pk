// src/app/admin/pages/payment-proofs/payment-proofs.component.ts
/**
 * AdminPaymentProofsComponent — Rentify PK admin
 * Route: /admin/payment-proofs
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists pending manual payment proofs (JazzCash / Easypaisa / Bank Transfer).
 * For each the admin can:
 *   • View the uploaded slip (click to zoom in a lightbox)
 *   • Verify  → PATCH /payments/bank-transfer/:ref/verify   (payment confirmed + escrow hold)
 *   • Reject  → PATCH /payments/bank-transfer/:ref/reject   { reason }
 *
 * Data: GET /payments/bank-transfer/pending → pending transactions with
 *       user, booking, meta.{method,reference,proofImageUrl,proofSubmittedAt}.
 * Reuses the shared admin CSS classes used by the CNIC queue page.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentAdminService } from '../../services/payment-admin.service';

@Component({
  selector:   'app-admin-payment-proofs',
  standalone: true,
  imports:    [CommonModule, FormsModule],
  template: `
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Payment Verification</h1>
        <p class="page-subtitle">Review and verify pending payment proofs</p>
      </div>
      <button class="btn-refresh" (click)="load()">Refresh</button>
    </div>

    <!-- Inline feedback -->
    <div class="msg" *ngIf="message()" [class.msg-ok]="msgType()==='ok'" [class.msg-err]="msgType()==='err'">
      {{ message() }}
    </div>

    <!-- Loading -->
    <div class="state" *ngIf="loading()">
      <div class="spin"></div><p>Loading payments…</p>
    </div>

    <!-- Empty -->
    <div class="state" *ngIf="!loading() && proofs().length === 0">
      <span class="state-icon">✓</span>
      <p class="state-title">All caught up!</p>
      <p class="state-sub">No pending payment proofs right now.</p>
    </div>

    <!-- Proof cards -->
    <div class="queue-grid" *ngIf="!loading() && proofs().length > 0">
      <div class="cnic-card" *ngFor="let p of proofs()">

        <!-- Payer header -->
        <div class="card-head">
          <div class="avatar">{{ (p.user?.name || 'U').charAt(0).toUpperCase() }}</div>
          <div class="who">
            <div class="who-name">{{ p.user?.name || 'User' }}</div>
            <div class="who-email">{{ p.user?.email }}</div>
          </div>
          <span class="score">{{ methodLabel(p.meta?.method) }}</span>
        </div>

        <!-- Payment meta -->
        <div class="meta">
          <div class="meta-row"><span>Reference</span><strong>{{ p.meta?.reference }}</strong></div>
          <div class="meta-row"><span>Amount</span><strong>Rs. {{ p.amount }}</strong></div>
          <div class="meta-row" *ngIf="p.user?.phone"><span>Phone</span><strong>{{ p.user?.phone }}</strong></div>
          <div class="meta-row" *ngIf="p.booking?.status"><span>Booking</span><strong>{{ p.booking?.status }}</strong></div>
          <div class="meta-row" *ngIf="p.meta?.proofSubmittedAt"><span>Submitted</span><strong>{{ p.meta?.proofSubmittedAt | date:'dd MMM, hh:mm a' }}</strong></div>
        </div>

        <!-- Slip image -->
        <div class="imgs">
          <div class="img-slot" *ngIf="p.meta?.proofImageUrl" (click)="zoom(p.meta?.proofImageUrl)">
            <img [src]="p.meta?.proofImageUrl" alt="Payment slip"/>
            <span>Slip</span>
          </div>
          <div class="no-imgs" *ngIf="!p.meta?.proofImageUrl">
            No slip uploaded
          </div>
        </div>

        <!-- Actions -->
        <div class="actions">
          <button class="btn-approve" [disabled]="acting()===p.meta?.reference" (click)="verify(p)">Verify</button>
          <button class="btn-reject"  [disabled]="acting()===p.meta?.reference" (click)="openReject(p)">Reject</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Slip lightbox -->
  <div class="lightbox" *ngIf="zoomImg()" (click)="zoomImg.set(null)">
    <img [src]="zoomImg()" alt="Slip zoom"/>
  </div>

  <!-- Reject reason modal -->
  <div class="modal-bg" *ngIf="rejectProof()" (click)="rejectProof.set(null)">
    <div class="modal" (click)="$event.stopPropagation()">
      <h3>Reject Payment</h3>
      <p>Rejecting payment <strong>{{ rejectProof()?.meta?.reference }}</strong>. Give a clear reason:</p>
      <textarea [(ngModel)]="rejectReason" rows="3"
        placeholder="e.g. slip unclear / amount mismatch / payment not received"></textarea>
      <div class="modal-btns">
        <button class="btn-ghost" (click)="rejectProof.set(null)">Cancel</button>
        <button class="btn-reject" [disabled]="!rejectReason.trim()" (click)="confirmReject()">Confirm Reject</button>
      </div>
    </div>
  </div>
  `,
  styles: [`
    .page { padding: 1.5rem; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.25rem; }
    .page-title { font-size:1.5rem; font-weight:700; color:#1f2937; margin:0; }
    .page-subtitle { color:#6b7280; font-size:.9rem; margin:.25rem 0 0; }
    .btn-refresh { padding:.5rem 1rem; border:1px solid #e5e7eb; border-radius:.5rem; background:#fff; cursor:pointer; font-weight:500; }
    .msg { padding:.75rem 1rem; border-radius:.5rem; margin-bottom:1rem; font-size:.9rem; }
    .msg-ok { background:#ecfdf5; color:#065f46; }
    .msg-err { background:#fef2f2; color:#991b1b; }
    .state { text-align:center; padding:3rem 1rem; color:#9ca3af; }
    .state-icon { font-size:2rem; display:block; margin-bottom:.5rem; }
    .state-title { font-weight:600; color:#374151; margin:.25rem 0; }
    .state-sub { font-size:.85rem; }
    .spin { width:36px; height:36px; border:3px solid #e5e7eb; border-top-color:#9d174d; border-radius:50%; margin:0 auto 1rem; animation:sp 1s linear infinite; }
    @keyframes sp { to { transform:rotate(360deg); } }
    .queue-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:1rem; }
    .cnic-card { background:#fff; border:1px solid #eef0f3; border-radius:.9rem; padding:1.1rem; box-shadow:0 1px 3px rgba(0,0,0,.04); }
    .card-head { display:flex; align-items:center; gap:.75rem; margin-bottom:.9rem; }
    .avatar { width:40px; height:40px; border-radius:50%; background:#9d174d; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; }
    .who-name { font-weight:600; color:#1f2937; }
    .who-email { font-size:.8rem; color:#6b7280; }
    .score { margin-left:auto; font-size:.7rem; font-weight:600; padding:.2rem .55rem; border-radius:1rem; background:#eef2ff; color:#3730a3; }
    .meta { background:#fafafa; border-radius:.6rem; padding:.7rem .85rem; margin-bottom:.9rem; }
    .meta-row { display:flex; justify-content:space-between; font-size:.83rem; padding:.18rem 0; }
    .meta-row span { color:#6b7280; }
    .meta-row strong { color:#1f2937; font-weight:600; }
    .imgs { display:flex; gap:.6rem; margin-bottom:.9rem; flex-wrap:wrap; }
    .img-slot { position:relative; cursor:pointer; border-radius:.5rem; overflow:hidden; border:1px solid #e5e7eb; }
    .img-slot img { width:140px; height:100px; object-fit:cover; display:block; }
    .img-slot span { position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,.55); color:#fff; font-size:.7rem; text-align:center; padding:.1rem; }
    .no-imgs { font-size:.8rem; color:#b91c1c; padding:.5rem; }
    .actions { display:flex; gap:.6rem; }
    .btn-approve, .btn-reject { flex:1; padding:.55rem; border:none; border-radius:.55rem; font-weight:600; cursor:pointer; font-size:.85rem; }
    .btn-approve { background:#059669; color:#fff; }
    .btn-reject { background:#dc2626; color:#fff; }
    .btn-approve:disabled, .btn-reject:disabled { opacity:.5; cursor:not-allowed; }
    .lightbox { position:fixed; inset:0; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; z-index:1000; cursor:zoom-out; }
    .lightbox img { max-width:92%; max-height:92%; border-radius:.5rem; }
    .modal-bg { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1001; }
    .modal { background:#fff; border-radius:.8rem; padding:1.4rem; width:90%; max-width:420px; }
    .modal h3 { margin:0 0 .5rem; color:#1f2937; }
    .modal p { font-size:.88rem; color:#4b5563; margin:0 0 .8rem; }
    .modal textarea { width:100%; border:1px solid #d1d5db; border-radius:.5rem; padding:.6rem; font-family:inherit; resize:vertical; }
    .modal-btns { display:flex; gap:.6rem; justify-content:flex-end; margin-top:.9rem; }
    .btn-ghost { padding:.5rem 1rem; border:1px solid #d1d5db; border-radius:.5rem; background:#fff; cursor:pointer; }
  `],
})
export class AdminPaymentProofsComponent implements OnInit {
  proofs = signal<any[]>([]);
  loading = signal(true);
  acting = signal<string | null>(null);
  zoomImg = signal<string | null>(null);
  rejectProof = signal<any | null>(null);
  rejectReason = '';
  message = signal<string>('');
  msgType = signal<'ok' | 'err'>('ok');

  constructor(private payments: PaymentAdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.payments.getPending().subscribe({
      next: (res) => { this.proofs.set(res?.data || []); this.loading.set(false); },
      error: () => { this.proofs.set([]); this.loading.set(false); this.flash('Failed to load payments.', 'err'); },
    });
  }

  zoom(url: string | null | undefined): void { if (url) this.zoomImg.set(url); }

  verify(p: any): void {
    const ref = p?.meta?.reference;
    if (!ref || this.acting()) return;
    this.acting.set(ref);
    this.payments.verify(ref).subscribe({
      next: () => { this.acting.set(null); this.flash('Payment verified. Booking confirmed.', 'ok'); this.load(); },
      error: (err) => { this.acting.set(null); this.flash(err?.error?.message || 'Verification failed.', 'err'); },
    });
  }

  openReject(p: any): void { this.rejectReason = ''; this.rejectProof.set(p); }

  confirmReject(): void {
    const p = this.rejectProof();
    const ref = p?.meta?.reference;
    if (!ref || !this.rejectReason.trim()) return;
    this.acting.set(ref);
    this.payments.reject(ref, this.rejectReason.trim()).subscribe({
      next: () => { this.acting.set(null); this.rejectProof.set(null); this.flash('Payment rejected.', 'ok'); this.load(); },
      error: (err) => { this.acting.set(null); this.flash(err?.error?.message || 'Rejection failed.', 'err'); },
    });
  }

  methodLabel(method: string | undefined): string {
    const m: Record<string, string> = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank_transfer: 'Bank Transfer' };
    return m[method || ''] || (method || 'Payment');
  }

  private flash(text: string, type: 'ok' | 'err'): void {
    this.message.set(text); this.msgType.set(type);
    setTimeout(() => this.message.set(''), 4000);
  }
}
