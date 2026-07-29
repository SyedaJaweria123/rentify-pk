import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { BookingService } from './booking.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-booking-request',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatDividerModule,
  ],
  template: `
    <div class="bg-white rounded-2xl border border-gray-200 shadow-lg p-6 sticky top-24">

      <!-- Price Header -->
      <div class="mb-5">
        <span class="text-3xl font-bold text-gray-900">Rs. {{ listing.price | number:'1.0-0' }}</span>
        <span class="text-gray-500 ml-1">/ {{ priceUnitLabel }}</span>
      </div>

      <mat-divider class="mb-5"></mat-divider>

      <!-- Auth gate -->
      @if (!authState.isLoggedIn) {
        <div class="text-center py-4">
          <p class="text-gray-600 mb-3">Login to book this item</p>
          <button mat-flat-button color="primary" routerLink="/auth/login" class="w-full">
            Login to Book
          </button>
        </div>
      }

      @if (authState.isLoggedIn && authState.isOwner) {
        <div class="text-center py-4 bg-amber-50 rounded-lg">
          <p class="text-amber-700 text-sm">Switch to a Renter account to book items.</p>
        </div>
      }

      @if (authState.isLoggedIn && !authState.isOwner) {
        <form [formGroup]="form" (ngSubmit)="onSubmit()">

          <!-- Date Range -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Start Date</mat-label>
              <input matInput [matDatepicker]="startPicker" formControlName="startDate"
                     [min]="minDate" (dateChange)="onDateChange()">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
              @if (form.get('startDate')?.hasError('required') && form.get('startDate')?.touched) {
                <mat-error>Start date required</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>End Date</mat-label>
              <input matInput [matDatepicker]="endPicker" formControlName="endDate"
                     [min]="form.get('startDate')?.value || minDate" (dateChange)="onDateChange()">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
              @if (form.get('endDate')?.hasError('required') && form.get('endDate')?.touched) {
                <mat-error>End date required</mat-error>
              }
            </mat-form-field>
          </div>

          <!-- Delivery Method -->
          <mat-form-field appearance="outline" class="w-full mb-3">
            <mat-label>Pickup/Delivery</mat-label>
            <mat-select formControlName="deliveryMethod">
              <mat-option value="pickup">Self Pickup</mat-option>
              <mat-option value="delivery">Delivery (if available)</mat-option>
            </mat-select>
          </mat-form-field>

          <!-- Vehicle Type (only when delivery is chosen) -->
          <ng-container *ngIf="isDelivery">

            <!-- Vehicle cards — renter chunay ga kaun sa vehicle chahiye -->
            <div class="mb-4">
              <p class="text-sm font-medium text-gray-700 mb-2">Delivery vehicle chunein:</p>
              <div class="grid grid-cols-3 gap-2">

                <!-- Bike -->
                <div (click)="selectVehicle('bike')"
                  class="cursor-pointer border-2 rounded-xl p-3 text-center transition-all
                    {{ form.get('vehicleType')?.value === 'bike'
                       ? 'border-indigo-500 bg-indigo-50'
                       : 'border-gray-200 hover:border-gray-300' }}">
                  <div class="text-2xl mb-1">🛵</div>
                  <p class="text-xs font-semibold text-gray-800">Bike</p>
                  <p class="text-xs text-indigo-600 font-bold mt-0.5">Rs. 250</p>
                  <p class="text-xs text-gray-400">Chhoti item</p>
                </div>

                <!-- Car -->
                <div (click)="selectVehicle('car')"
                  class="cursor-pointer border-2 rounded-xl p-3 text-center transition-all
                    {{ form.get('vehicleType')?.value === 'car'
                       ? 'border-indigo-500 bg-indigo-50'
                       : 'border-gray-200 hover:border-gray-300' }}">
                  <div class="text-2xl mb-1">🚗</div>
                  <p class="text-xs font-semibold text-gray-800">Car</p>
                  <p class="text-xs text-indigo-600 font-bold mt-0.5">Rs. 500</p>
                  <p class="text-xs text-gray-400">Medium item</p>
                </div>

                <!-- Van -->
                <div (click)="selectVehicle('van')"
                  class="cursor-pointer border-2 rounded-xl p-3 text-center transition-all
                    {{ form.get('vehicleType')?.value === 'van'
                       ? 'border-indigo-500 bg-indigo-50'
                       : 'border-gray-200 hover:border-gray-300' }}">
                  <div class="text-2xl mb-1">🚐</div>
                  <p class="text-xs font-semibold text-gray-800">Van</p>
                  <p class="text-xs text-indigo-600 font-bold mt-0.5">Rs. 999</p>
                  <p class="text-xs text-gray-400">Bari item</p>
                </div>

              </div>
            </div>

          </ng-container>

          <!-- Delivery address (only when delivery is chosen) -->
          <ng-container *ngIf="isDelivery">
            <mat-form-field appearance="outline" class="w-full mb-3">
              <mat-label>Delivery address</mat-label>
              <textarea matInput formControlName="deliveryAddress" rows="2"
                        placeholder="House #, street, area, city — where the rider should deliver"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full mb-3">
              <mat-label>Contact number</mat-label>
              <input matInput formControlName="deliveryPhone" placeholder="03001234567" maxlength="11">
            </mat-form-field>
          </ng-container>

          <!-- Message -->
          <mat-form-field appearance="outline" class="w-full mb-4">
            <mat-label>Message to owner (optional)</mat-label>
            <textarea matInput formControlName="message" rows="3"
                      placeholder="Introduce yourself or ask a question..."></textarea>
          </mat-form-field>

          <!-- Pricing Breakdown -->
          @if (pricing()) {
            <div class="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600">
                  Rs. {{ listing.price | number:'1.0-0' }} × {{ pricing()!.days }} days
                </span>
                <span>Rs. {{ pricing()!.subtotal | number:'1.0-0' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Service fee (5%)</span>
                <span>Rs. {{ pricing()!.serviceFee | number:'1.0-0' }}</span>
              </div>
              <!-- Delivery fee row — sirf delivery select hone par -->
              <div *ngIf="isDelivery" class="flex justify-between">
                <span class="text-gray-600">
                  Delivery fee
                  <span class="text-xs text-indigo-500 ml-1">({{ vehicleLabel }})</span>
                </span>
                <span>Rs. {{ deliveryFeeAmount | number:'1.0-0' }}</span>
              </div>
              <mat-divider></mat-divider>
              <div class="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>Rs. {{ grandTotal | number:'1.0-0' }}</span>
              </div>
            </div>
          }

          @if (!checkingAvailability() && availability() === false) {
            <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
              ❌ Not available for selected dates. Please choose different dates.
            </div>
          }

          @if (!checkingAvailability() && availability() === true) {
            <div class="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
              ✅ Available for selected dates!
            </div>
          }

          <button mat-flat-button color="primary" type="submit" class="w-full !py-3 !text-base"
                  [disabled]="submitting() || form.invalid || availability() === false">
            @if (submitting()) {
              <mat-spinner diameter="20" class="inline-block mr-2"></mat-spinner>
              Sending Request...
            } @else {
              Request to Book
            }
          </button>

          <p class="text-center text-xs text-gray-400 mt-3">
            You won't be charged until the owner accepts.
          </p>
        </form>
      }
    </div>
  `,
})
export class BookingRequestComponent implements OnInit {
  @Input() listing!: any;

  form!: FormGroup;
  minDate = new Date();

  pricing        = signal<any | null>(null);
  availability   = signal<boolean | null>(null);
  checkingAvailability = signal(false);
  submitting     = signal(false);

  private availabilityTimer: any;

  constructor(
    private fb:         FormBuilder,
    private bookingSvc: BookingService,
    public  authState:  AuthService,
    private snack:      MatSnackBar,
    private router:     Router,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      startDate:      [null, Validators.required],
      endDate:        [null, Validators.required],
      deliveryMethod:  ['pickup'],
      deliveryAddress: [''],
      deliveryPhone:   [''],
      vehicleType:     ['bike'],   // default bike
      message:         [''],
    });
  }

  /** True when the renter chose door delivery (address is then required). */
  get isDelivery(): boolean {
    return this.form?.get('deliveryMethod')?.value === 'delivery';
  }

  get priceUnitLabel(): string {
    const map: Record<string, string> = {
      per_day:   'day',
      per_week:  'week',
      per_month: 'month',
      per_hour:  'hour',
    };
    return map[this.listing?.priceUnit] || 'day';
  }

  onDateChange(): void {
    this.pricing.set(null);
    this.availability.set(null);

    const { startDate, endDate } = this.form.value;
    if (!startDate || !endDate) return;
    if (new Date(endDate) <= new Date(startDate)) return;

    clearTimeout(this.availabilityTimer);
    this.checkingAvailability.set(true);

    this.availabilityTimer = setTimeout(() => {
      this.bookingSvc.checkAvailability({
        listingId: this.listing._id,
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate).toISOString(),
      }).subscribe({
        next: (res) => {
          this.availability.set(res.data.available);
          this.pricing.set(res.data.pricing);
          this.checkingAvailability.set(false);
        },
        error: () => this.checkingAvailability.set(false),
      });
    }, 500);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    const { startDate, endDate, deliveryMethod, deliveryAddress, deliveryPhone, message } = this.form.value;

    // For door delivery, the rider needs an address + a contact number.
    if (deliveryMethod === 'delivery') {
      if (!deliveryAddress || deliveryAddress.trim().length < 10) {
        this.snack.open('Please enter your full delivery address (at least 10 characters).', 'OK', { duration: 4000 });
        return;
      }
      if (!/^03\d{9}$/.test((deliveryPhone || '').trim())) {
        this.snack.open('Please enter a valid phone (03XXXXXXXXX) for the rider to contact you.', 'OK', { duration: 4000 });
        return;
      }
    }

    this.submitting.set(true);
    const { vehicleType } = this.form.value;
    this.bookingSvc.create({
      listingId:      this.listing._id,
      startDate:      new Date(startDate).toISOString(),
      endDate:        new Date(endDate).toISOString(),
      deliveryMethod,
      deliveryAddress: deliveryMethod === 'delivery' ? deliveryAddress.trim() : null,
      deliveryPhone:   deliveryMethod === 'delivery' ? deliveryPhone.trim() : null,
      vehicleType:     deliveryMethod === 'delivery' ? vehicleType : null,
      message,
    } as any).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.snack.open('Booking request sent!', 'View', { duration: 5000 })
          .onAction().subscribe(() => this.router.navigate(['/bookings', res.data.booking.id]));
      },
      error: (err) => {
        this.submitting.set(false);
        this.snack.open(err.error?.message || 'Failed to send request', 'Close', { duration: 4000 });
      },
    });
  }

  /** Vehicle card click handler */
  selectVehicle(type: 'bike' | 'car' | 'van'): void {
    this.form.get('vehicleType')?.setValue(type);
    // Recalculate pricing display with new fee
    this.onDateChange();
  }

  /** Vehicle label for pricing row */
  get vehicleLabel(): string {
    const map: Record<string, string> = { bike: 'Bike 🛵', car: 'Car 🚗', van: 'Van 🚐' };
    return map[this.form.get('vehicleType')?.value || 'bike'] || 'Bike';
  }

  /** Delivery fee based on selected vehicle */
  get deliveryFeeAmount(): number {
    const fees: Record<string, number> = { bike: 250, car: 500, van: 999 };
    return fees[this.form.get('vehicleType')?.value || 'bike'] || 250;
  }

  /** Grand total = pricing total + delivery fee (shown before API recalculates) */
  get grandTotal(): number {
    if (!this.pricing()) return 0;
    const base = this.pricing()!.totalAmount || 0;
    return this.isDelivery ? base + this.deliveryFeeAmount : base;
  }
}
