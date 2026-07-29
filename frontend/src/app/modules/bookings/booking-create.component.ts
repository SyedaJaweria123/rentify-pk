import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-booking-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DecimalPipe],
  templateUrl: './booking-create.component.html',
  styleUrls: ['./booking-create.component.css'],
})
export class BookingCreateComponent implements OnInit, OnDestroy {

  /* ── Listing data (loaded from API) ── */
  listing:        any = null;
  listingLoading  = true;
  listingError    = '';

  /* ── Date range form ── */
  startDate = '';
  endDate   = '';
  note      = '';

  /* ── Calculated values ── */
  rentalDays      = 0;
  basePrice       = 0;
  serviceFee      = 0;
  securityDeposit = 0;
  deliveryFee     = 0;
  totalPrice      = 0;
  advancePercent  = 100;
  advanceAmount   = 0;
  remainingAmount = 0;

  /* ── Delivery method ── */
  deliveryMethod: 'pickup' | 'delivery' = 'pickup';
  vehicleType: 'bike' | 'car' | 'van' = 'bike';
  deliveryAddress = '';
  deliveryPhone   = '';

  // Vehicle fee table mirrors the backend defaults so the price breakdown is
  // accurate before the booking is even created (backend recalculates and
  // is the source of truth — this is just for display).
  readonly VEHICLE_FEES: Record<'bike' | 'car' | 'van', number> = { bike: 250, car: 500, van: 999 };

  /* ── Submit state ── */
  submitting  = false;
  submitError = '';
  submitted   = false;
  bookingId   = '';

  /* ── Field errors ── */
  errors: Record<string, string> = {};

  public  listingId = '';
  private destroy$  = new Subject<void>();

  constructor(
    private route:  ActivatedRoute,
    public  router: Router,
    private http:   HttpClient,
  ) {}

  ngOnInit(): void {
    this.listingId = this.route.snapshot.paramMap.get('id') || '';

    // Pre-fill dates from query params (passed from listing detail page)
    const params = this.route.snapshot.queryParamMap;
    this.startDate = params.get('start') || '';
    this.endDate   = params.get('end')   || '';

    if (this.listingId) {
      this.loadListing();
    } else {
      this.listingError   = 'No listing ID provided.';
      this.listingLoading = false;
    }

    // Calculate if dates already provided
    if (this.startDate && this.endDate) {
      this.calculatePrice();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load listing details ────────────────────────────────────────────────
  loadListing(): void {
    this.http.get<any>(`${environment.apiUrl}/listings/${this.listingId}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.listing        = res.data?.listing;
          this.listingLoading = false;
          this.calculatePrice();
        },
        error: (err) => {
          this.listingError   = err.error?.message || 'Listing not found.';
          this.listingLoading = false;
        },
      });
  }

  // ── Real-time price calculation on date change ──────────────────────────
  onDateChange(): void {
    this.errors['startDate'] = '';
    this.errors['endDate']   = '';
    this.calculatePrice();
  }

  calculatePrice(): void {
    if (!this.startDate || !this.endDate || !this.listing) {
      this.rentalDays = 0; this.basePrice = 0;
      this.serviceFee = 0; this.totalPrice = 0;
      return;
    }

    const start = new Date(this.startDate);
    const end   = new Date(this.endDate);

    if (end <= start) {
      this.errors['endDate'] = 'End date must be after start date';
      this.rentalDays = 0; this.totalPrice = 0;
      return;
    }

    const diffMs   = end.getTime() - start.getTime();
    const days     = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    this.rentalDays = days;

    const pricePerDay = this.listing.price || 0;
    const unit        = this.listing.priceUnit || 'per_day';

    // Calculate base price based on price unit
    if      (unit === 'per_day')   this.basePrice = days * pricePerDay;
    else if (unit === 'per_week')  this.basePrice = Math.ceil(days / 7) * pricePerDay;
    else if (unit === 'per_month') this.basePrice = Math.ceil(days / 30) * pricePerDay;
    else                           this.basePrice = days * pricePerDay;

    this.serviceFee      = Math.round(this.basePrice * 0.05);  // 5% platform fee
    this.securityDeposit = this.listing.securityDeposit || 0;
    this.deliveryFee      = this.deliveryMethod === 'delivery' ? this.VEHICLE_FEES[this.vehicleType] : 0;

    // Rental portion is what the advance % applies to — the security
    // deposit is always paid in full upfront alongside the advance, since
    // it must be in escrow before handover (never part of "due on delivery").
    const rentalPortion = this.basePrice + this.serviceFee + this.deliveryFee;
    this.totalPrice       = rentalPortion + this.securityDeposit;

    // Trust-Tiered Payment: advance % comes from the owner's trust badge.
    // Falls back to 100% (pay in full) if the listing doesn't carry badge
    // info yet — the backend recalculates the real figure when the booking
    // is actually created, so this is purely a preview.
    this.advancePercent  = this.advancePercentForBadge(this.listing.createdBy?.trustBadge);
    const advanceRental   = Math.round(rentalPortion * this.advancePercent / 100);
    this.advanceAmount   = advanceRental + this.securityDeposit;
    this.remainingAmount = Math.max(0, rentalPortion - advanceRental);
  }

  // ── Delivery method change ──────────────────────────────────────────────
  onDeliveryMethodChange(): void {
    this.calculatePrice();
  }

  onVehicleTypeChange(): void {
    this.calculatePrice();
  }

  // Mirrors trustScore.service.js's ADVANCE_PERCENT_BY_BADGE table — kept in
  // sync manually since this is a display-only preview, not the source of
  // truth (the backend snapshot on the actual booking always wins).
  private advancePercentForBadge(badge: string | undefined): number {
    const table: Record<string, number> = { Gold: 10, Silver: 20, Bronze: 30, none: 40 };
    return table[badge || 'none'] ?? 70;
  }

  // ── Validation ──────────────────────────────────────────────────────────
  validate(): boolean {
    this.errors = {};
    if (!this.startDate) { this.errors['startDate'] = 'Start date is required'; }
    if (!this.endDate)   { this.errors['endDate']   = 'End date is required'; }
    if (this.startDate && this.endDate) {
      const s = new Date(this.startDate);
      const e = new Date(this.endDate);
      if (s < new Date(new Date().setHours(0,0,0,0))) {
        this.errors['startDate'] = 'Start date cannot be in the past';
      }
      if (e <= s) { this.errors['endDate'] = 'End date must be after start date'; }
    }
    return Object.keys(this.errors).length === 0;
  }

  // ── Submit booking ──────────────────────────────────────────────────────
  submitBooking(): void {
    if (!this.validate()) return;
    this.submitting  = true;
    this.submitError = '';

    this.http.post<any>(`${environment.apiUrl}/bookings`, {
      listingId:  this.listingId,
      startDate:  this.startDate,
      endDate:    this.endDate,
      message:    this.note.trim(),
      totalDays:  this.rentalDays,
      deliveryMethod:  this.deliveryMethod,
      vehicleType:     this.deliveryMethod === 'delivery' ? this.vehicleType : undefined,
      deliveryAddress: this.deliveryMethod === 'delivery' ? this.deliveryAddress.trim() : undefined,
      deliveryPhone:   this.deliveryMethod === 'delivery' ? this.deliveryPhone.trim() : undefined,
    }).subscribe({
      next: (res) => {
        this.submitting = false;
        this.submitted  = true;
        this.bookingId  = res.data?.booking?._id || res.data?.booking?.id || '';
      },
      error: (err) => {
        this.submitting  = false;
        this.submitError = err.error?.message || 'Failed to create booking. Please try again.';
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  get today(): string {
    return new Date().toISOString().split('T')[0];
  }

  get minEndDate(): string {
    if (!this.startDate) return this.today;
    const d = new Date(this.startDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  get priceUnitLabel(): string {
    const map: Record<string, string> = {
      per_day: '/day', per_week: '/week', per_month: '/month', per_hour: '/hour',
    };
    return map[this.listing?.priceUnit || 'per_day'] || '/day';
  }

  getListingImage(): string {
    return this.listing?.images?.[0]?.url || '';
  }
}
