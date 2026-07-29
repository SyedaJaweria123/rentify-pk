import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { WalletService } from './wallet.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { AuthService } from '../../services/auth.service';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [
    CommonModule, DatePipe, FormsModule, ReactiveFormsModule,
    MatProgressSpinnerModule, MatSnackBarModule, OwnerLayoutComponent, RenterLayoutComponent,
  ],
  templateUrl: './wallet.component.html',
  styleUrls:   ['./wallet.component.css'],
})
export class WalletComponent implements OnInit {
  summary        = signal<any | null>(null);
  transactions   = signal<any[]>([]);
  txPagination   = signal<any | null>(null);
  loadingTx      = signal(false);
  submitting     = signal(false);
  activeTxFilter = signal('');
  showWithdraw     = false;
  showSortMenu     = false;
  txPage           = 1;
  activeSortFilter = signal('latest');

  readonly txFilters = [
    { label: 'All',      value: '' },
    { label: 'Earnings', value: 'booking_earning' },
    { label: 'Delivery',  value: 'rider_earning' },
    { label: 'Withdraw', value: 'withdrawal' },
  ];

  withdrawForm!: FormGroup;

  constructor(
    private walletSvc: WalletService,
    public  authState: AuthStateService,
    private auth:      AuthService,
    private snack:     MatSnackBar,
    private fb:        FormBuilder,
  ) {}

  get isOwner(): boolean { return this.auth.isOwner; }
  get isRider(): boolean { return this.auth.currentUser?.role === 'rider'; }

  ngOnInit(): void {
    this.withdrawForm = this.fb.group({
      amount:        [null, [Validators.required, Validators.min(100)]],
      method:        ['easypaisa', Validators.required],
      accountNumber: ['', Validators.required],
    });
    this.loadSummary();
    this.loadTx(1);
  }

  loadSummary(): void {
    this.walletSvc.getSummary().subscribe({
      next: (res) => this.summary.set(res.data),
      error: () => {},
    });
  }

  loadTx(page: number): void {
    this.txPage = page;
    this.loadingTx.set(true);
    const sort = this.activeSortFilter();
    const sortParam = sort === 'oldest' ? 'oldest'
                    : sort === 'highest' ? 'highest'
                    : sort === 'lowest'  ? 'lowest'
                    : 'latest';
    this.walletSvc.getTransactions({
      page, limit: 10,
      type: this.activeTxFilter() || undefined,
      sort: sortParam,
    }).subscribe({
      next: (res) => {
        this.transactions.set(res.data.transactions);
        this.txPagination.set(res.data.pagination);
        this.loadingTx.set(false);
      },
      error: () => this.loadingTx.set(false),
    });
  }

  onTxFilter(value: string): void {
    this.activeTxFilter.set(value);
    this.loadTx(1);
  }

  onSortFilter(sort: string): void {
    this.activeSortFilter.set(sort);
    this.showSortMenu = false;
    this.loadTx(1);
  }

  onWithdraw(): void {
    if (this.withdrawForm.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.walletSvc.withdraw(this.withdrawForm.value).subscribe({
      next: () => {
        this.snack.open('✅ Withdrawal request submitted! Admin will process within 1-3 business days.', 'OK', { duration: 7000 });
        this.withdrawForm.reset({ method: 'easypaisa' });
        this.submitting.set(false);
        this.showWithdraw = false;
        this.loadSummary();
        this.loadTx(1);
      },
      error: (err) => {
        this.snack.open(err.error?.message || 'Withdrawal failed', 'Close', { duration: 4000 });
        this.submitting.set(false);
      },
    });
  }
}
