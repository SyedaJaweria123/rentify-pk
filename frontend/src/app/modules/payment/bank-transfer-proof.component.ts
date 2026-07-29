import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-bank-transfer-proof',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-8 max-w-lg">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">Upload Payment Proof</h1>
      <p class="text-gray-500 mb-6">
        Reference: <span class="font-mono font-semibold text-gray-700">{{ reference() }}</span>
      </p>

      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <label class="block">
          <span class="block text-sm font-medium text-gray-700 mb-2">Transfer screenshot</span>
          <input type="file" accept="image/*" (change)="onFile($event)"
            class="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-rose-50 file:text-rose-700 file:font-medium hover:file:bg-rose-100" />
        </label>

        @if (previewUrl()) {
          <img [src]="previewUrl()" alt="proof preview"
            class="mt-4 rounded-lg border border-gray-200 max-h-72 mx-auto" />
        }

        <button (click)="submit()" [disabled]="!file() || uploading()"
          class="mt-6 w-full px-5 py-2.5 rounded-lg bg-rose-700 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2">
          @if (uploading()) { <mat-spinner diameter="20"></mat-spinner> }
          <span>{{ uploading() ? 'Uploading…' : 'Submit Proof' }}</span>
        </button>
      </div>

      <p class="text-xs text-gray-400 mt-4 text-center">
        An admin will verify your transfer and confirm the booking.
      </p>
    </div>
  `,
})
export class BankTransferProofComponent implements OnInit {
  reference = signal('');
  file = signal<File | null>(null);
  previewUrl = signal<string | null>(null);
  uploading = signal(false);

  private bookingId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private payments: PaymentService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    this.reference.set(this.route.snapshot.queryParamMap.get('ref') || '');
    if (!this.reference()) {
      this.snack.open('Missing payment reference.', 'Dismiss', { duration: 4000 });
      this.router.navigate(['/dashboard']);
    }
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files && input.files.length ? input.files[0] : null;
    this.file.set(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => this.previewUrl.set(reader.result as string);
      reader.readAsDataURL(f);
    } else {
      this.previewUrl.set(null);
    }
  }

  submit(): void {
    const f = this.file();
    if (!f || this.uploading()) return;
    this.uploading.set(true);

    const fd = new FormData();
    fd.append('proof', f);
    fd.append('referenceNumber', this.reference());

    this.payments.submitBankProof(fd).subscribe({
      next: () => {
        this.uploading.set(false);
        this.snack.open('Proof submitted. Awaiting admin verification.', 'OK', { duration: 5000 });
        this.router.navigate(['/payment/status', this.bookingId]);
      },
      error: (err) => {
        this.uploading.set(false);
        this.snack.open(err?.error?.message || 'Upload failed.', 'Dismiss', { duration: 5000 });
      },
    });
  }
}
