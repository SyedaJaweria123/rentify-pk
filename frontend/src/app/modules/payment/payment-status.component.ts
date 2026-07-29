import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-payment-status',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-10 max-w-lg text-center">
      @if (loading()) {
        <mat-spinner diameter="44" class="mx-auto"></mat-spinner>
        <p class="text-gray-500 mt-4">Checking payment status…</p>
      } @else {
        <div class="bg-white border border-gray-200 rounded-2xl p-8">
          <div class="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
               [class.bg-green-100]="isPaid()" [class.bg-amber-100]="isPending()" [class.bg-gray-100]="isOther()">
            @if (isPaid()) {
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
            } @else if (isPending()) {
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            } @else {
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
            }
          </div>

          <h1 class="text-xl font-bold text-gray-900 mb-1">{{ heading() }}</h1>
          <p class="text-gray-500 text-sm mb-6">{{ subtext() }}</p>

          @if (txMethod()) {
            <div class="text-sm text-gray-600 mb-6">
              Method: <span class="font-medium">{{ txMethod() }}</span>
              @if (txReference()) { · Ref: <span class="font-mono">{{ txReference() }}</span> }
            </div>
          }

          <div class="flex gap-3 justify-center">
            <button (click)="goToBooking()" class="px-5 py-2.5 rounded-lg bg-rose-700 text-white font-medium">View Booking</button>
            @if (!isPaid()) {
              <button (click)="refresh()" class="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium">Refresh</button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class PaymentStatusComponent implements OnInit, OnDestroy {
  loading = signal(true);
  paymentStatus = signal<string>('');
  txMethod = signal<string | null>(null);
  txReference = signal<string | null>(null);

  isPaid = () => this.paymentStatus() === 'paid';
  isPending = () => this.paymentStatus() === 'unpaid' || this.paymentStatus() === 'pending';
  isOther = () => !this.isPaid() && !this.isPending();

  heading = () => this.isPaid() ? 'Payment Confirmed' : this.isPending() ? 'Payment Pending' : 'Payment Status';
  subtext = () => this.isPaid()
    ? 'Your booking is confirmed. Thank you!'
    : this.isPending()
      ? 'We are waiting for your payment to be confirmed.'
      : 'Current status of your payment.';

  private bookingId = '';
  private timer: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private payments: PaymentService,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (!this.bookingId) { this.router.navigate(['/dashboard']); return; }
    this.load();
    // Light polling while pending (every 8s, stops once paid)
    this.timer = setInterval(() => { if (!this.isPaid()) this.load(true); }, 8000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.payments.getStatus(this.bookingId).subscribe({
      next: (res) => {
        const d = res?.data || {};
        this.paymentStatus.set(d.paymentStatus || '');
        this.txMethod.set(d.transaction?.method || null);
        this.txReference.set(d.transaction?.reference || null);
        this.loading.set(false);
        if (this.isPaid() && this.timer) { clearInterval(this.timer); this.timer = null; }
      },
      error: () => this.loading.set(false),
    });
  }

  refresh(): void { this.load(); }
  goToBooking(): void { this.router.navigate(['/bookings', this.bookingId]); }
}
