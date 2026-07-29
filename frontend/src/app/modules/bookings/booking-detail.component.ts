import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

import { BookingService } from './booking.service';
import { AuthService } from '../../services/auth.service';
import { Booking, BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS } from '../../models/booking.model';
import { Listing, PRICE_UNIT_LABELS } from '../../models/listing.model';
import { InspectionService }          from '../inspection/inspection.service';
import { DamageClaimService }         from '../damage-claim/damage-claim.service';
import { OwnerLayoutComponent }       from '../dashboard/owner-layout.component';
import { RenterLayoutComponent }      from '../dashboard/renter-layout.component';

/**
 * Booking Detail — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Redesigned to match the forest-green theme used across the rest of the
 * dashboard (see the July 2026 ChatGPT mockup this was built from), and now
 * renders inside the matching owner/renter sidebar shell instead of a bare
 * MainLayout page. All business logic below is unchanged from before —
 * only the template (moved to its own .html/.css files) and layout wrapper
 * changed.
 */
@Component({
  selector: 'app-booking-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule, DatePipe, DecimalPipe,
    MatSnackBarModule, OwnerLayoutComponent, RenterLayoutComponent,
  ],
  templateUrl: './booking-detail.component.html',
  styleUrls: ['./booking-detail.component.css'],
})

export class BookingDetailComponent implements OnInit {
  booking:        Booking | null = null;
  listing:        Listing | null = null;
  loading         = true;
  error           = '';
  actionLoading   = false;
  actionError     = '';
  bookingId       = '';

  constructor(
    private route:          ActivatedRoute,
    private router:         Router,
    private bookingService: BookingService,
    private snack:          MatSnackBar,
    public  authService:    AuthService,
    private http:           HttpClient,
    private inspectionService: InspectionService,
    private damageClaimService: DamageClaimService,
  ) {}

  get currentUser() { return this.authService.currentUser; }

  get isOwner(): boolean {
    if (!this.booking || !this.currentUser) return false;
    const ownerId = (this.booking.owner as any)?._id || (this.booking.owner as any)?.id || this.booking.owner;
    const myId    = this.currentUser.id || (this.currentUser as any)._id;
    // Compare as strings — owner may be an ObjectId object, myId a string
    return String(ownerId) === String(myId);
  }

  /** True when the logged-in user is the renter on this booking */
  get isRenter(): boolean {
    if (!this.booking || !this.currentUser) return false;
    const renterId = (this.booking.renter as any)?._id || (this.booking.renter as any)?.id || this.booking.renter;
    const myId     = this.currentUser.id || (this.currentUser as any)._id;
    return String(renterId) === String(myId);
  }

  get statusLabel(): string { return BOOKING_STATUS_LABELS[this.booking?.status || 'pending']; }
  get statusColor():  string { return BOOKING_STATUS_COLORS[this.booking?.status || 'pending']; }

  /** Inspection + damage tools show once the item is out (active) or done (completed) */
  get showItemChecks(): boolean {
    const s = this.booking?.status || '';
    // Condition checks matter from the moment the item is out with the renter.
    // For door delivery that starts at 'delivered' (the rider has handed it
    // over) — waiting for 'active' hid the whole section during the window
    // where photos actually get taken. Self-pickup has no rider handover, so
    // the item is already with the renter at 'confirmed'.
    const isPickup = this.booking?.deliveryMethod === 'pickup';
    const states = isPickup
      ? ['confirmed', 'active', 'completed']
      : ['delivered', 'active', 'completed'];
    return (this.isOwner || this.isRenter) && states.includes(s);
  }

  /** Renter can pay when the booking is confirmed but nothing (or only the
   *  advance) has been charged yet — 'partial_paid' means the advance is
   *  already settled and the rest comes via COD/wallet at handover, so the
   *  gateway button must NOT show again for that status. */
  get showPayNow(): boolean {
    return this.isRenter
      && this.booking?.status === 'confirmed'
      && (this.booking?.paymentStatus || 'unpaid') === 'unpaid';
  }

  // ── Handover QR (owner/renter show this to the rider) ───────────────────────
  qrCode: string | null = null;
  qrStatus: string | null = null;
  qrCopied = false;

  loadQR(): void {
    const id = (this.booking as any)?._id || (this.booking as any)?.id;
    if (!id) return;
    if ((this.booking as any)?.deliveryMethod !== 'delivery') return;
    this.http.get<any>(`${environment.apiUrl}/bookings/${id}/qr`).subscribe({
      next: (res) => {
        this.qrCode    = res?.data?.qrCode  || null;
        this.qrStatus  = res?.data?.status  || null;
        this.hasReturnLeg = !!res?.data?.hasReturnLeg;
        this.riderInfo = res?.data?.rider   || null;
      },
      error: () => { this.qrCode = null; },
    });
  }

  riderInfo: { id: string; name: string; avatar: string | null; riderRating: number; riderBadge: string } | null = null;

  goRiderProfile(): void {
    if (!this.riderInfo?.id) return;
    this.router.navigate(['/rider-public', this.riderInfo.id]);
  }

  /** Show the QR block to the owner/renter while a rider handover is pending. */
  get showQR(): boolean {
    if (!this.qrCode) return false;
    return this.isOwner || this.isRenter;
  }

  /** QR image URL (free QR render service). */
  get qrImageUrl(): string {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&ecc=M&data=' + encodeURIComponent(this.qrCode || '');
  }

  copyQR(): void {
    if (!this.qrCode) return;
    navigator.clipboard?.writeText(this.qrCode).then(() => {
      this.qrCopied = true;
      setTimeout(() => this.qrCopied = false, 2000);
    }).catch(() => {});
  }

  goToPayment(): void {
    const id = (this.booking as any)?._id || (this.booking as any)?.id;
    if (id) {
      this.router.navigate(['/payment/checkout', id]);
    }
  }

  get paymentStatusColor(): string {
    const m: Record<string, string> = {
      unpaid: 'text-gray-500', paid: 'text-green-600', pending: 'text-yellow-600',
      partial_paid: 'text-amber-600',
      refunded: 'text-blue-600', partial_refund: 'text-orange-600',
    };
    return m[this.booking?.paymentStatus || 'pending'] || '';
  }

  get paymentStatusLabel(): string {
    const m: Record<string, string> = {
      unpaid: 'Unpaid', paid: 'Paid in full', pending: 'Pending',
      partial_paid: 'Advance paid', refunded: 'Refunded', partial_refund: 'Partially refunded',
    };
    return m[this.booking?.paymentStatus || 'pending'] || this.booking?.paymentStatus || '';
  }

  /** Only show the advance/remaining split when the booking actually used it
   *  (advancePercent < 100) — older bookings or pickup-only bookings with no
   *  remaining balance just show the plain total. */
  get hasAdvanceSplit(): boolean {
    const b = this.booking;
    if (!b) return false;
    return (b.advancePercent ?? 100) < 100 && (b.remainingAmount ?? 0) > 0;
  }

  get remainingIsSettled(): boolean {
    return !!this.booking?.remainingCollectedAt;
  }

  get remainingLabel(): string {
    if (this.booking?.remainingRefused) return 'Remaining (refused)';
    if (this.remainingIsSettled) return this.isOwner ? 'Remaining collected' : 'Remaining (paid)';
    return 'Due on delivery';
  }

  get listingObj(): Listing | null {
    return typeof this.booking?.listing === 'object' ? (this.booking!.listing as Listing) : this.listing;
  }
  get listingTitle():    string { return this.listingObj?.title    || 'Listing'; }
  get listingCategory(): string { return this.listingObj?.category || ''; }
  get listingImage():    string { return this.listingObj?.images?.[0]?.url || '/assets/placeholder.png'; }
  get priceUnitLabel():  string { return PRICE_UNIT_LABELS[this.listingObj?.priceUnit || 'per_day']; }

  get otherParty(): any {
    return this.isOwner ? (this.booking?.renter as any) : (this.booking?.owner as any);
  }
  get otherPartyName():    string { return this.otherParty?.name  || 'User'; }
  get otherPartyEmail():   string { return this.otherParty?.email || ''; }
  get otherPartyAvatar():  string { return this.otherParty?.avatar || ''; }
  get otherPartyInitial(): string {
    const name = this.otherParty?.name || 'U';
    return name.charAt(0).toUpperCase();
  }

  get canCancel(): boolean {
    return ['pending', 'confirmed'].includes(this.booking?.status || '');
  }

  get canReview(): boolean {
    if (!this.booking || this.booking.status !== 'completed') return false;
    return this.isOwner ? !this.booking.ownerReviewed : !this.booking.renterReviewed;
  }

  get canReviewRider(): boolean {
    if (!this.booking) return false;
    if (!['completed', 'delivered', 'active'].includes(this.booking.status)) return false;
    const alreadyReviewed = this.isOwner ? this.booking.ownerReviewedRider : this.booking.renterReviewedRider;
    if (alreadyReviewed) return false;
    return !!this.riderInfo;
  }

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.bookingId) { this.error = 'Invalid booking ID'; this.loading = false; return; }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.bookingService.getById(this.bookingId).subscribe({
      next: (res) => { this.booking = res.data.booking; this.loading = false; this.loadQR(); this.loadInspectionStatus(); this.loadExistingClaim(); },
      error: (err) => { this.error = err.error?.message || 'Booking not found'; this.loading = false; },
    });
  }

  // Inspection sequencing — return photos require delivery photos first,
  // and the AI comparison requires both. Mirrors the backend guard in
  // completeBooking()/escrowCron.service.js, which blocks completion
  // without a submitted return inspection.
  hasDeliveryInspection = false;
  hasReturnInspection   = false;
  inspectionStatusLoaded = false;

  loadInspectionStatus(): void {
    this.inspectionService.getDelivery(this.bookingId).subscribe({
      next: () => { this.hasDeliveryInspection = true; this.inspectionStatusLoaded = true; },
      error: () => { this.hasDeliveryInspection = false; this.inspectionStatusLoaded = true; },
    });
    this.inspectionService.getReturn(this.bookingId).subscribe({
      next: () => { this.hasReturnInspection = true; },
      error: () => { this.hasReturnInspection = false; },
    });
  }

  // Existing damage claim (if any) for this booking — lets the UI offer
  // "View Damage Claim" with live status instead of always pointing at
  // "File Damage Claim", which previously gave no way to find a claim that
  // was already filed (by this owner, or to check on it as the renter).
  existingClaim: any = null;
  existingClaimLoaded = false;

  loadExistingClaim(): void {
    this.damageClaimService.getByBooking(this.bookingId).subscribe({
      next: (res) => { this.existingClaim = res?.data || null; this.existingClaimLoaded = true; },
      error: () => { this.existingClaim = null; this.existingClaimLoaded = true; },
    });
  }

  goBack(): void { this.router.navigate(['/bookings']); }

  // Inspection + damage claim navigation
  goInspection(type: 'delivery' | 'return'): void {
    if (type === 'return' && !this.hasDeliveryInspection) {
      this.toast('Submit delivery photos first.');
      return;
    }
    this.router.navigate(['/inspection', type, this.bookingId]);
  }
  goComparison(): void {
    if (!this.hasDeliveryInspection || !this.hasReturnInspection) {
      this.toast('Both delivery and return photos are required first.');
      return;
    }
    this.router.navigate(['/inspection/compare', this.bookingId]);
  }
  goDamageClaim(): void {
    if (!this.hasReturnInspection) {
      this.toast('Submit return photos before filing a damage claim.');
      return;
    }
    this.router.navigate(['/damage-claim/new', this.bookingId]);
  }
  goViewClaim(): void {
    if (!this.existingClaim) return;
    this.router.navigate(['/damage-claim', this.existingClaim._id]);
  }

  confirmBooking(): void {
    this.actionLoading = true; this.actionError = '';
    this.bookingService.confirm(this.bookingId).subscribe({
      next: (res) => { this.booking = res.data.booking; this.actionLoading = false; this.toast('Booking confirmed!'); },
      error: (err) => { this.actionError = err.error?.message || 'Error'; this.actionLoading = false; },
    });
  }

  openReject(): void {
    const reason = prompt('Reason for rejection:');
    if (!reason?.trim()) return;
    this.actionLoading = true; this.actionError = '';
    this.bookingService.reject(this.bookingId, reason).subscribe({
      next: (res) => { this.booking = res.data.booking; this.actionLoading = false; this.toast('Booking rejected.'); },
      error: (err) => { this.actionError = err.error?.message || 'Error'; this.actionLoading = false; },
    });
  }

  openCancel(): void {
    const reason = prompt('Reason for cancellation:');
    if (!reason?.trim()) return;
    this.actionLoading = true; this.actionError = '';
    this.bookingService.cancel(this.bookingId, reason).subscribe({
      next: (res) => { this.booking = res.data.booking; this.actionLoading = false; this.toast('Booking cancelled.'); },
      error: (err) => { this.actionError = err.error?.message || 'Error'; this.actionLoading = false; },
    });
  }

  completeBooking(force = false): void {
    this.actionLoading = true; this.actionError = '';
    this.bookingService.complete(this.bookingId, force).subscribe({
      next: (res) => { this.booking = res.data.booking; this.actionLoading = false; this.toast('Marked as complete!'); },
      error: (err) => {
        this.actionLoading = false;
        // No return pickup arranged yet — the renter may still physically hold
        // the item, so confirm before releasing the deposit.
        if (err.error?.needsReturnConfirm) {
          if (confirm(`${err.error.message}\n\nDo you already have the item back? Press OK to complete anyway.`)) {
            this.completeBooking(true);
          }
          return;
        }
        this.actionError = err.error?.message || 'Error';
      },
    });
  }

  // ── Return pickup ──────────────────────────────────────────────────────────
  returnRequested = false;

  /** True once the backend confirms a return-leg rider is already assigned. */
  hasReturnLeg = false;

  /** Show "Request Return Pickup" whenever the item still needs to physically go
   *  back: a delivery booking, no active return leg yet, and the item has
   *  reached the renter. `completed` is included on purpose — an owner can mark
   *  a booking complete before the item was actually collected, and without
   *  this the renter is left with no way to send it back. */
  get canRequestReturn(): boolean {
    if (!this.booking) return false;
    if (this.booking.deliveryMethod !== 'delivery') return false;
    if (this.returnRequested || this.hasReturnLeg) return false;
    return (this.isOwner || this.isRenter)
      && ['delivered', 'active', 'completed'].includes(this.booking.status || '');
  }

  requestReturnPickup(): void {
    if (!confirm('Request a rider to collect this item and return it to the owner?')) return;
    this.actionLoading = true; this.actionError = '';
    this.bookingService.requestReturn(this.bookingId).subscribe({
      next: (res) => {
        this.actionLoading = false;
        this.returnRequested = true;
        // A new return-leg assignment just got created, which carries its own
        // handover QR — reload it so the renter can show the rider a code
        // immediately instead of having to refresh the page.
        this.loadQR();
        this.toast(res?.message || 'A rider has been assigned to collect the item.');
      },
      error: (err) => {
        this.actionLoading = false;
        this.toast(err.error?.message || 'Could not request return pickup.');
      },
    });
  }

  collectCash(): void {
    this.actionLoading = true; this.actionError = '';
    this.bookingService.collectRemaining(this.bookingId, 'cash').subscribe({
      next: (res) => { this.booking = res.data.booking; this.actionLoading = false; this.toast('Cash payment recorded — you can now complete the booking.'); },
      error: (err) => { this.actionError = err.error?.message || 'Error'; this.actionLoading = false; this.toast(err.error?.message || 'Could not record payment.'); },
    });
  }

  // Navigates to the full dispute form (issue type, description, evidence
  // upload) which creates a proper Dispute document — visible to admins,
  // notifies the other party, and supports evidence/resolution tracking.
  // (Previously this used a raw prompt() that only set Booking.disputeReason,
  // which never created a Dispute record and never reached the admin panel.)
  openDispute(): void { this.router.navigate(['/dispute', this.bookingId]); }

  messageOtherParty(): void {
    const id = (this.otherParty as any)?._id || (this.otherParty as any)?.id;
    const listingId = (this.booking?.listing as any)?._id || (this.booking?.listing as any)?.id || this.booking?.listing;
    this.router.navigate(['/messages'], { queryParams: { userId: id, listingId } });
  }

  /** Renter viewing this booking → jump to the owner's public profile. */
  goToOwnerProfile(): void {
    const ownerId = (this.booking?.owner as any)?._id || (this.booking?.owner as any)?.id || this.booking?.owner;
    if (!ownerId) return;
    this.router.navigate(['/owner', ownerId]);
  }

  private toast(msg: string): void {
    this.snack.open(msg, 'Close', { duration: 3500, horizontalPosition: 'end' });
  }
}
