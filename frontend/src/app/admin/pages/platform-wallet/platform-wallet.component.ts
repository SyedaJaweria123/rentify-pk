// src/app/admin/pages/platform-wallet/platform-wallet.component.ts
/**
 * Admin · Platform Wallet — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * The platform's own commission ledger, laid out like the owner wallet:
 *   • Available Balance card with a Withdraw action
 *   • Stat strip: Total Earned / Total Withdrawn / Transactions
 *   • Filterable history of commission credits and platform withdrawals
 * Withdrawals use the same methods and Rs 100 minimum as owner withdrawals and
 * are stored as 'platform_withdrawal' rows, so the balance is always
 * earned − withdrawn (recomputed server-side, never trusted from here).
 * APIs: GET /api/admin/platform-wallet, POST /api/admin/platform-wallet/withdraw
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

type Filter = 'all' | 'commission' | 'withdrawal';

@Component({
  selector: 'app-platform-wallet',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="pw-wrap">
      <header class="pw-head">
        <h1>Platform Wallet</h1>
        <p>Commission earned from every completed rental.</p>
      </header>

      <!-- Balance + withdraw -->
      <div class="pw-balance-card">
        <div class="pw-balance-main">
          <span class="pw-balance-label">Available Balance</span>
          <span class="pw-balance-val">Rs. {{ balance() | number:'1.0-0' }}</span>
          <button class="pw-withdraw-btn" (click)="openWithdraw()" [disabled]="balance() < 100">
            <span aria-hidden="true">+</span> Withdraw
          </button>
        </div>
        <div class="pw-wallet-art" aria-hidden="true">
          <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="14" y="24" width="86" height="58" rx="12" fill="#1F5435"/>
            <rect x="14" y="24" width="86" height="58" rx="12" stroke="#143524" stroke-width="2"/>
            <path d="M22 24V18a8 8 0 018-8h48a8 8 0 018 8v6" stroke="#143524" stroke-width="3" stroke-linecap="round"/>
            <rect x="66" y="44" width="42" height="20" rx="7" fill="#EAF3DE"/>
            <circle cx="79" cy="54" r="5" fill="#1F5435"/>
          </svg>
        </div>
      </div>

      <!-- Stat strip -->
      <div class="pw-stats">
        <div class="pw-stat">
          <span class="pw-stat-ic pw-ic-up" aria-hidden="true">&#8599;</span>
          <div><span class="pw-stat-lbl">Total Earned</span><span class="pw-stat-val">Rs. {{ earned() | number:'1.0-0' }}</span></div>
        </div>
        <div class="pw-stat">
          <span class="pw-stat-ic pw-ic-down" aria-hidden="true">&#8600;</span>
          <div><span class="pw-stat-lbl">Total Withdrawn</span><span class="pw-stat-val pw-neg">Rs. {{ withdrawn() | number:'1.0-0' }}</span></div>
        </div>
        <div class="pw-stat">
          <span class="pw-stat-ic pw-ic-blue" aria-hidden="true">&#9636;</span>
          <div><span class="pw-stat-lbl">Transactions</span><span class="pw-stat-val pw-blue">{{ pagTotal() }}</span></div>
        </div>
      </div>

      <!-- History -->
      <div class="pw-history">
        <div class="pw-history-head">
          <h2>Transaction History</h2>
          <div class="pw-filters">
            <button [class.active]="filter() === 'all'"        (click)="setFilter('all')">All</button>
            <button [class.active]="filter() === 'commission'" (click)="setFilter('commission')">Commission</button>
            <button [class.active]="filter() === 'withdrawal'" (click)="setFilter('withdrawal')">Withdrawals</button>
          </div>
        </div>

        <div *ngIf="loading()" class="pw-empty">Loading&hellip;</div>
        <div *ngIf="!loading() && shown().length === 0" class="pw-empty">No transactions yet.</div>

        <div class="pw-rows" *ngIf="!loading() && shown().length > 0">
          <div class="pw-row" *ngFor="let h of shown()">
            <span class="pw-row-ic" [class.pw-row-out]="h.type === 'platform_withdrawal'" aria-hidden="true">
              {{ h.type === 'platform_withdrawal' ? '&#8595;' : '&#8593;' }}
            </span>
            <div class="pw-row-body">
              <span class="pw-row-title">
                {{ h.type === 'platform_withdrawal' ? h.item : 'Commission from ' + h.item }}
                <span *ngIf="h.backfilled" class="pw-tag">backfilled</span>
                <span *ngIf="h.status === 'pending'" class="pw-tag pw-tag-pending">pending</span>
              </span>
              <span class="pw-row-meta">
                {{ h.date | date:'d MMM y' }} &middot; {{ h.date | date:'shortTime' }}
                <ng-container *ngIf="h.bookingId"> &middot; #{{ shortId(h.bookingId) }}</ng-container>
              </span>
            </div>
            <span class="pw-row-amt" [class.pw-neg]="h.amount < 0">
              {{ h.amount < 0 ? '' : '+' }}Rs. {{ h.amount | number:'1.0-0' }}
            </span>
          </div>
        </div>

        <div *ngIf="totalPages() > 1" class="pw-pager">
          <button [disabled]="page() === 1" (click)="go(page() - 1)">&lsaquo; Prev</button>
          <span>Page {{ page() }} of {{ totalPages() }}</span>
          <button [disabled]="page() === totalPages()" (click)="go(page() + 1)">Next &rsaquo;</button>
        </div>
      </div>
    </div>

    <!-- Withdraw modal -->
    <div class="pw-modal-bg" *ngIf="showWithdraw()" (click)="closeWithdraw()">
      <div class="pw-modal" (click)="$event.stopPropagation()">
        <h3>Withdraw Commission</h3>
        <p class="pw-modal-sub">Available: Rs. {{ balance() | number:'1.0-0' }}</p>

        <label for="pw-amt">Amount (Rs.)</label>
        <input id="pw-amt" type="number" [(ngModel)]="wAmount" min="100" [max]="balance()" placeholder="Minimum 100">

        <label for="pw-method">Method</label>
        <select id="pw-method" [(ngModel)]="wMethod">
          <option value="easypaisa">Easypaisa</option>
          <option value="jazzcash">JazzCash</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>

        <label for="pw-acct">Account Number</label>
        <input id="pw-acct" type="text" [(ngModel)]="wAccount" placeholder="e.g. 03001234567">

        <p class="pw-modal-err" *ngIf="wError()">{{ wError() }}</p>

        <div class="pw-modal-btns">
          <button class="pw-btn-ghost" (click)="closeWithdraw()" [disabled]="submitting()">Cancel</button>
          <button class="pw-btn-solid" (click)="submitWithdraw()" [disabled]="submitting()">
            {{ submitting() ? 'Processing…' : 'Confirm Withdrawal' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pw-wrap { padding: 4px 2px 40px; }
    .pw-head h1 { font-size: 26px; font-weight: 800; color: #14532D; margin: 0; letter-spacing: -.02em; }
    .pw-head p { color: #64748B; font-size: 14px; margin: 4px 0 22px; }

    .pw-balance-card {
      display: flex; justify-content: space-between; align-items: center; gap: 20px;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 20px;
      padding: 30px 34px; margin-bottom: 18px;
      box-shadow: 0 4px 20px rgba(20,83,45,.06);
    }
    .pw-balance-main { display: flex; flex-direction: column; gap: 6px; }
    .pw-balance-label { font-size: 13px; color: #64748B; font-weight: 500; }
    .pw-balance-val { font-size: 38px; font-weight: 800; color: #1E293B; letter-spacing: -.03em; line-height: 1.1; }
    .pw-withdraw-btn {
      margin-top: 12px; align-self: flex-start;
      display: inline-flex; align-items: center; gap: 8px;
      background: #14532D; color: #fff; border: none;
      padding: 12px 24px; border-radius: 10px;
      font-size: 14.5px; font-weight: 700; font-family: inherit; cursor: pointer;
      transition: filter .2s, transform .2s;
    }
    .pw-withdraw-btn:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
    .pw-withdraw-btn:disabled { opacity: .5; cursor: default; }
    .pw-wallet-art { width: 132px; flex-shrink: 0; }
    .pw-wallet-art svg { width: 100%; height: auto; }

    .pw-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
    .pw-stat {
      display: flex; align-items: center; gap: 12px;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px 18px;
    }
    .pw-stat-ic {
      width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 17px;
    }
    .pw-ic-up   { background: #dcfce7; color: #16A34A; }
    .pw-ic-down { background: #fee2e2; color: #dc2626; }
    .pw-ic-blue { background: #dbeafe; color: #2563eb; }
    .pw-stat-lbl { display: block; font-size: 12.5px; color: #64748B; }
    .pw-stat-val { display: block; font-size: 17px; font-weight: 800; color: #1E293B; }
    .pw-neg  { color: #dc2626; }
    .pw-blue { color: #2563eb; }

    .pw-history { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px 24px; }
    .pw-history-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 6px; }
    .pw-history-head h2 { font-size: 16px; font-weight: 800; color: #1E293B; margin: 0; }
    .pw-filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .pw-filters button {
      padding: 7px 16px; border-radius: 999px; border: 1px solid #e5e7eb;
      background: #fff; color: #475569; font-size: 13px; font-weight: 600;
      font-family: inherit; cursor: pointer; transition: all .2s;
    }
    .pw-filters button.active { background: #14532D; border-color: #14532D; color: #fff; }

    .pw-empty { text-align: center; color: #94a3b8; padding: 32px 0; font-size: 14px; }
    .pw-rows { display: flex; flex-direction: column; }
    .pw-row { display: flex; align-items: center; gap: 14px; padding: 15px 0; border-bottom: 1px solid #f1f5f9; }
    .pw-row:last-child { border-bottom: none; }
    .pw-row-ic {
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: #dcfce7; color: #16A34A; font-size: 16px; font-weight: 700;
    }
    .pw-row-ic.pw-row-out { background: #fee2e2; color: #dc2626; }
    .pw-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .pw-row-title { font-size: 14px; font-weight: 700; color: #1E293B; }
    .pw-row-meta  { font-size: 12px; color: #94a3b8; }
    .pw-row-amt   { font-size: 15px; font-weight: 800; color: #16A34A; flex-shrink: 0; }
    .pw-tag {
      display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 700;
      color: #92400e; background: #fef3c7; padding: 2px 7px; border-radius: 999px;
    }
    .pw-tag-pending { color: #1d4ed8; background: #dbeafe; }

    .pw-pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 18px; }
    .pw-pager button {
      padding: 7px 16px; border: 1px solid #d1d5db; background: #fff; border-radius: 8px;
      font-size: 13px; font-weight: 600; color: #14532D; cursor: pointer; font-family: inherit;
    }
    .pw-pager button:disabled { opacity: .45; cursor: default; }
    .pw-pager span { font-size: 13px; color: #64748B; }

    .pw-modal-bg {
      position: fixed; inset: 0; background: rgba(15,23,42,.5);
      display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px;
    }
    .pw-modal {
      background: #fff; border-radius: 18px; padding: 28px; width: 100%; max-width: 420px;
      box-shadow: 0 24px 60px rgba(0,0,0,.25);
    }
    .pw-modal h3 { font-size: 19px; font-weight: 800; color: #14532D; margin: 0 0 4px; }
    .pw-modal-sub { font-size: 13px; color: #64748B; margin: 0 0 18px; }
    .pw-modal label { display: block; font-size: 12.5px; font-weight: 600; color: #475569; margin: 12px 0 5px; }
    .pw-modal input, .pw-modal select {
      width: 100%; padding: 11px 13px; border: 1px solid #d1d5db; border-radius: 9px;
      font-size: 14px; font-family: inherit; color: #1E293B; box-sizing: border-box;
    }
    .pw-modal input:focus, .pw-modal select:focus { outline: 2px solid #14532D; outline-offset: -1px; border-color: transparent; }
    .pw-modal-err { color: #dc2626; font-size: 13px; margin: 12px 0 0; }
    .pw-modal-btns { display: flex; gap: 10px; margin-top: 22px; }
    .pw-btn-ghost, .pw-btn-solid {
      flex: 1; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: filter .2s;
    }
    .pw-btn-ghost { background: #fff; border: 1px solid #d1d5db; color: #475569; }
    .pw-btn-solid { background: #14532D; border: none; color: #fff; }
    .pw-btn-solid:disabled, .pw-btn-ghost:disabled { opacity: .6; cursor: default; }

    @media (max-width: 720px) {
      .pw-stats { grid-template-columns: 1fr; }
      .pw-balance-card { padding: 24px; }
      .pw-balance-val { font-size: 30px; }
      .pw-wallet-art { width: 90px; }
    }
  `],
})
export class PlatformWalletComponent implements OnInit {
  balance   = signal(0);
  earned    = signal(0);
  withdrawn = signal(0);
  thisMonth = signal(0);
  txnCount  = signal(0);
  history   = signal<any[]>([]);
  page      = signal(1);
  totalPages = signal(1);
  pagTotal  = signal(0);
  loading   = signal(true);
  filter    = signal<Filter>('all');

  // Withdraw modal state
  showWithdraw = signal(false);
  submitting   = signal(false);
  wError       = signal('');
  wAmount: number | null = null;
  wMethod = 'easypaisa';
  wAccount = '';

  /** Client-side filter over the current page of history. */
  shown = computed(() => {
    const f = this.filter();
    const rows = this.history();
    if (f === 'commission') return rows.filter(r => r.type === 'service_fee');
    if (f === 'withdrawal') return rows.filter(r => r.type === 'platform_withdrawal');
    return rows;
  });

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void { this.load(); }

  setFilter(f: Filter): void { this.filter.set(f); }
  go(p: number): void { this.page.set(p); this.load(); }

  shortId(id: any): string { return String(id || '').slice(-8).toUpperCase(); }

  openWithdraw(): void {
    this.wAmount = null; this.wMethod = 'easypaisa'; this.wAccount = '';
    this.wError.set('');
    this.showWithdraw.set(true);
  }
  closeWithdraw(): void { if (!this.submitting()) this.showWithdraw.set(false); }

  submitWithdraw(): void {
    const amt = Number(this.wAmount);
    if (!amt || amt < 100)    { this.wError.set('Minimum withdrawal is Rs. 100.'); return; }
    if (amt > this.balance()) { this.wError.set(`Insufficient balance. Available: Rs. ${Math.round(this.balance())}`); return; }
    if (!this.wAccount.trim()) { this.wError.set('Account number is required.'); return; }

    this.submitting.set(true); this.wError.set('');
    this.adminSvc.withdrawPlatformFunds({
      amount: amt, method: this.wMethod, accountNumber: this.wAccount.trim(),
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showWithdraw.set(false);
        this.page.set(1);
        this.load();          // refresh balance + history from the server
      },
      error: (err) => {
        this.submitting.set(false);
        this.wError.set(err?.error?.message || 'Withdrawal failed. Please try again.');
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.adminSvc.getPlatformWallet({ page: this.page(), limit: 15 }).subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.balance.set(d.balance || 0);
        this.earned.set(d.earned || 0);
        this.withdrawn.set(d.withdrawn || 0);
        this.thisMonth.set(d.thisMonth || 0);
        this.txnCount.set(d.txnCount || 0);
        this.history.set(d.history || []);
        this.totalPages.set(d.pagination?.totalPages || 1);
        this.pagTotal.set(d.pagination?.total || 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
