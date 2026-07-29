import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PaymentService, PaymentGateway } from './payment.service';

interface GatewayOption {
  id: PaymentGateway;
  subtype?: 'bank_account';
  name: string;
  desc: string;
}

@Component({
  selector: 'app-payment-checkout',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">Complete Payment</h1>
      <p class="text-gray-500 mb-6">Choose how you'd like to pay for this booking.</p>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <mat-spinner diameter="44"></mat-spinner>
        </div>
      } @else {

        <!-- Already paid -->
        @if (alreadyPaid()) {
          <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div class="text-green-700 font-semibold text-lg mb-1">Payment already completed</div>
            <p class="text-green-600 text-sm mb-4">This booking is confirmed.</p>
            <button (click)="goToBooking()" class="px-5 py-2.5 rounded-lg bg-green-600 text-white font-medium">
              View Booking
            </button>
          </div>
        } @else {

          <!-- Trust-Tiered Payment breakdown: advance now, remainder on delivery -->
          @if (advanceAmount() > 0 || remainingAmount() > 0) {
            <div class="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-5">
              <p class="text-sm font-semibold text-gray-900 mb-3">
                Pay {{ advancePercent() }}% now, rest on delivery
              </p>
              <div class="flex justify-between text-sm mb-1">
                <span class="text-gray-600">Pay now (advance)</span>
                <span class="font-semibold text-gray-900">Rs. {{ advanceAmount() }}</span>
              </div>
              @if (remainingAmount() > 0) {
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600">Due on delivery</span>
                  <span class="font-semibold text-gray-900">Rs. {{ remainingAmount() }}</span>
                </div>
              }
              <p class="text-xs text-gray-500 mt-3">
                The advance is based on the owner's trust rating — more established owners need less upfront.
              </p>
            </div>
          }

          <!-- Gateway options -->
          @if (!bankDetails()) {
            <div class="space-y-3">
              @for (g of gateways; track g.name) {
                <button
                  (click)="select(g)"
                  [disabled]="processing()"
                  [class.ring-2]="selectedKey() === g.name"
                  class="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white text-left hover:border-rose-400 ring-rose-500 transition disabled:opacity-50">
                  <span class="shrink-0 w-11 h-11 rounded-lg bg-rose-50 flex items-center justify-center text-rose-700">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                    </svg>
                  </span>
                  <span class="flex-1">
                    <span class="block font-semibold text-gray-900">{{ g.name }}</span>
                    <span class="block text-sm text-gray-500">{{ g.desc }}</span>
                  </span>
                  @if (processing() && selectedKey() === g.name) {
                    <mat-spinner diameter="20"></mat-spinner>
                  }
                </button>
              }

              <!-- Cash on Delivery — only when there's a delivery/rider involved -->
              @if (codAvailable()) {
                <button
                  (click)="selectCOD()"
                  [disabled]="processing()"
                  class="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white text-left hover:border-rose-400 transition disabled:opacity-50">
                  <span class="shrink-0 w-11 h-11 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/>
                    </svg>
                  </span>
                  <span class="flex-1">
                    <span class="block font-semibold text-gray-900">Cash on Delivery</span>
                    <span class="block text-sm text-gray-500">
                      Pay the Rs. {{ advanceAmount() }} advance to the rider in cash at handover
                    </span>
                  </span>
                </button>
              }
            </div>
          }

          <!-- COD confirmation (no gateway redirect needed) -->
          @if (codConfirmed()) {
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <div class="text-amber-700 font-semibold text-lg mb-1">Cash on Delivery selected</div>
              <p class="text-amber-700 text-sm mb-1">
                Rs. {{ advanceAmount() }} (advance) will be collected by the rider at delivery.
              </p>
              @if (remainingAmount() > 0) {
                <p class="text-amber-600 text-xs mb-4">
                  The remaining Rs. {{ remainingAmount() }} is collected separately when your rental period ends.
                </p>
              }
              <button (click)="goToBooking()" class="px-5 py-2.5 rounded-lg bg-amber-600 text-white font-medium">
                View Booking
              </button>
            </div>
          }

          <!-- Payment instructions (all methods) -->
          @if (bankDetails(); as bd) {
            <div class="bg-white border border-gray-200 rounded-xl p-6 mt-2">
              <h2 class="font-semibold text-gray-900 mb-4">{{ payHeading() }}</h2>
              <dl class="space-y-2 text-sm">
                <div class="flex justify-between"><dt class="text-gray-500">Reference</dt><dd class="font-mono font-semibold">{{ bd.referenceNumber }}</dd></div>

                @if (isBank()) {
                  <div class="flex justify-between"><dt class="text-gray-500">Bank</dt><dd>{{ bd.payTo?.bankName || bd.bankName }}</dd></div>
                  <div class="flex justify-between"><dt class="text-gray-500">Account Title</dt><dd>{{ bd.payTo?.accountTitle || bd.accountTitle }}</dd></div>
                  <div class="flex justify-between"><dt class="text-gray-500">Account #</dt><dd class="font-mono">{{ bd.payTo?.accountNumber || bd.accountNumber }}</dd></div>
                  <div class="flex justify-between"><dt class="text-gray-500">IBAN</dt><dd class="font-mono">{{ bd.payTo?.iban || bd.iban }}</dd></div>
                } @else {
                  <div class="flex justify-between"><dt class="text-gray-500">{{ bd.payTo?.label || 'Account' }}</dt><dd class="font-mono font-semibold">{{ bd.payTo?.value || '—' }}</dd></div>
                }

                <div class="flex justify-between"><dt class="text-gray-500">Amount</dt><dd class="font-semibold">Rs. {{ bd.amount }}</dd></div>
              </dl>
              <p class="text-xs text-gray-500 mt-4 whitespace-pre-line">{{ bd.instructions }}</p>
              <button (click)="goToProof(bd.referenceNumber)" class="mt-5 w-full px-5 py-2.5 rounded-lg bg-rose-700 text-white font-medium">
                I've paid — Upload proof
              </button>
            </div>
          }
        }
      }
    </div>
  `,
})
export class PaymentCheckoutComponent implements OnInit {
  loading = signal(true);
  processing = signal(false);
  selected = signal<PaymentGateway | null>(null);
  alreadyPaid = signal(false);
  bankDetails = signal<any | null>(null);
  selectedKey = signal<string | null>(null);
  bankSubtype = signal<'bank_account' | null>(null);
  selectedMethod = signal<string | null>(null);

  // Trust-Tiered Payment breakdown + Cash on Delivery
  advancePercent  = signal(100);
  advanceAmount   = signal(0);
  remainingAmount = signal(0);
  codAvailable    = signal(false);
  codConfirmed    = signal(false);

  isBank = () => this.selectedMethod() === 'bank_transfer';
  payHeading = () => {
    const m = this.selectedMethod();
    if (m === 'jazzcash') return 'JazzCash Payment Instructions';
    if (m === 'easypaisa') return 'Easypaisa Payment Instructions';
    return 'Bank Transfer Instructions';
  };

  bookingId = '';

  gateways: GatewayOption[] = [
    { id: 'jazzcash',      name: 'JazzCash',      desc: 'Mobile account payment' },
    { id: 'easypaisa',     name: 'Easypaisa',     desc: 'Mobile account or shop' },
    { id: 'bank_transfer', subtype: 'bank_account', name: 'Bank Account Transfer', desc: 'Online / app transfer to our IBAN' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private payments: PaymentService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (!this.bookingId) { this.router.navigate(['/dashboard']); return; }

    this.payments.getStatus(this.bookingId).subscribe({
      next: (res) => {
        const data = res?.data || {};
        if (data.paymentStatus === 'paid') this.alreadyPaid.set(true);
        this.advancePercent.set(data.advancePercent ?? 100);
        this.advanceAmount.set(data.advanceAmount ?? 0);
        this.remainingAmount.set(data.remainingAmount ?? 0);
        // COD only makes sense when there's something left to collect at
        // handover — i.e. a real delivery rider is involved in this booking.
        this.codAvailable.set((data.remainingAmount ?? 0) > 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  select(option: GatewayOption): void {
    if (this.processing()) return;
    this.selectedKey.set(option.name);
    this.selectedMethod.set(option.id);
    this.bankSubtype.set(option.subtype || null);
    this.processing.set(true);

    this.payments.initiate({ bookingId: this.bookingId, gateway: option.id }).subscribe({
      next: (res) => {
        this.processing.set(false);
        const data = res?.data || {};
        // Live gateway redirect (only when API keys configured)
        if (data.redirectUrl || data.paymentUrl) {
          this.postToGateway(data.redirectUrl || data.paymentUrl, data.fields || {});
          return;
        }
        // Manual proof mode (no keys) OR bank transfer → show pay-to details + slip upload
        if (data.referenceNumber) {
          this.bankDetails.set(data);
        } else {
          this.snack.open('Payment started. Follow the prompts.', 'OK', { duration: 4000 });
        }
      },
      error: (err) => {
        this.processing.set(false);
        this.snack.open(err?.error?.message || 'Could not start payment.', 'Dismiss', { duration: 5000 });
      },
    });
  }

  selectCOD(): void {
    if (this.processing()) return;
    this.processing.set(true);

    this.payments.initiate({ bookingId: this.bookingId, gateway: 'cash_on_delivery' }).subscribe({
      next: () => {
        this.processing.set(false);
        this.codConfirmed.set(true);
      },
      error: (err) => {
        this.processing.set(false);
        this.snack.open(err?.error?.message || 'Could not select Cash on Delivery.', 'Dismiss', { duration: 5000 });
      },
    });
  }

  /** Build + submit a hidden form to redirect to JazzCash/Easypaisa. */
  private postToGateway(url: string, fields: Record<string, string>): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    Object.entries(fields).forEach(([k, v]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = String(v);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  goToProof(ref: string): void {
    this.router.navigate(['/payment/bank-proof', this.bookingId], { queryParams: { ref } });
  }

  goToBooking(): void {
    this.router.navigate(['/bookings', this.bookingId]);
  }
}
