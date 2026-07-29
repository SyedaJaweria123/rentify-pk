import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-become-rider',
  standalone: true,
  imports: [CommonModule, FormsModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-10 max-w-xl">
      <!-- Hero -->
      <div class="text-center mb-8">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9d174d" stroke-width="1.8"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">Become a Rider</h1>
        <p class="text-gray-500 text-sm mt-1">Deliver rentals and earn on every completed delivery.</p>
      </div>

      <!-- Already rider -->
      @if (alreadyRider()) {
        <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p class="text-green-700 font-semibold mb-3">You are already a Rider.</p>
          <button (click)="goRider()" class="px-5 py-2.5 rounded-lg bg-green-600 text-white font-medium text-sm">Go to Rider Dashboard</button>
        </div>
      } @else {
        <div class="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <!-- Phone -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Mobile number <span class="text-red-500">*</span></label>
            <input type="tel" [(ngModel)]="phone" placeholder="03XXXXXXXXX" maxlength="11"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500" />
            @if (fieldErr('phone')) { <p class="text-xs text-red-600 mt-1">{{ fieldErr('phone') }}</p> }
          </div>

          <!-- CNIC -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CNIC <span class="text-red-500">*</span></label>
            <input type="text" [(ngModel)]="cnicNumber" placeholder="42101-1234567-1" maxlength="15"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500" />
            @if (fieldErr('cnicNumber')) { <p class="text-xs text-red-600 mt-1">{{ fieldErr('cnicNumber') }}</p> }
          </div>

          <!-- Vehicle -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Vehicle <span class="text-red-500">*</span></label>
            <div class="grid grid-cols-3 gap-2">
              @for (v of vehicles; track v.id) {
                <button type="button" (click)="vehicleType = v.id"
                  [class.ring-2]="vehicleType === v.id" [class.border-rose-400]="vehicleType === v.id"
                  class="py-3 rounded-lg border border-gray-200 text-sm font-medium ring-rose-500 capitalize">
                  {{ v.label }}
                </button>
              }
            </div>
            @if (fieldErr('vehicleType')) { <p class="text-xs text-red-600 mt-1">{{ fieldErr('vehicleType') }}</p> }
          </div>

          @if (errorMsg()) {
            <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{{ errorMsg() }}</div>
          }

          <button (click)="submit()" [disabled]="!isValid() || submitting()"
            class="w-full py-2.5 rounded-lg bg-rose-700 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            @if (submitting()) { <mat-spinner diameter="18"></mat-spinner> }
            <span>{{ submitting() ? 'Submitting…' : 'Become a Rider' }}</span>
          </button>
          <p class="text-xs text-gray-400 text-center">By continuing you agree to deliver items responsibly.</p>
        </div>
      }
    </div>
  `,
})
export class BecomeRiderComponent implements OnInit {
  phone = '';
  cnicNumber = '';
  vehicleType = '';
  submitting = signal(false);
  errorMsg = signal<string>('');
  fieldErrors = signal<Record<string, string>>({});
  alreadyRider = signal(false);

  vehicles = [
    { id: 'bike', label: 'Bike' },
    { id: 'car',  label: 'Car' },
    { id: 'van',  label: 'Van' },
  ];

  isValid = computed(() =>
    this.phone.trim().length >= 11 && this.cnicNumber.trim().length >= 13 && !!this.vehicleType,
  );

  constructor(
    private auth: AuthService,
    private router: Router,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    if (!this.auth.isLoggedIn) { this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/become-rider' } }); return; }
    if (String(this.auth.currentUser?.role || '') === 'rider') this.alreadyRider.set(true);
  }

  fieldErr(field: string): string { return this.fieldErrors()[field] || ''; }

  submit(): void {
    this.errorMsg.set('');
    this.fieldErrors.set({});
    if (!this.isValid()) { this.errorMsg.set('Please fill all fields correctly.'); return; }
    if (this.submitting()) return;
    this.submitting.set(true);

    this.auth.upgradeToRider({
      phone: this.phone.trim(),
      cnicNumber: this.cnicNumber.trim(),
      vehicleType: this.vehicleType,
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res?.data?.user) this.auth.updateUser(res.data.user);
        this.snack.open('You are now a Rider!', 'OK', { duration: 4000 });
        this.router.navigate(['/rider']);
      },
      error: (err) => {
        this.submitting.set(false);
        const b = err?.error || {};
        if (Array.isArray(b.errors)) {
          const map: Record<string, string> = {};
          b.errors.forEach((e: any) => { if (e.field) map[e.field] = e.message; });
          this.fieldErrors.set(map);
        }
        this.errorMsg.set(b.message || 'Failed to register as rider.');
      },
    });
  }

  goRider(): void { this.router.navigate(['/rider']); }
}
