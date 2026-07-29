import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ListingService } from '../../services/listing.service';
import { AuthService }    from '../../services/auth.service';
import { ChatService }    from '../../modules/chat/chat.service';
import { BookingService } from '../../modules/bookings/booking.service';
import { Listing, ListingOwner, PRICE_UNIT_LABELS, OwnerStats } from '../../models/listing.model';
import { AvailabilityCalendarComponent } from '../availability-calendar/availability-calendar.component';
import { ListingReviewsComponent } from '../../modules/reviews/listing-reviews.component';
import { TrustBadgeComponent } from '../../shared/components/trust-badge/trust-badge.component';
import { WishlistService } from '../../modules/wishlist/wishlist.service';
import { CartService } from '../../modules/cart/cart.service';
import { ReviewService } from '../../modules/reviews/review.service';

@Component({
  selector: 'app-listing-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe, DecimalPipe, AvailabilityCalendarComponent, ListingReviewsComponent, TrustBadgeComponent],
  templateUrl: './listing-detail.component.html',
  styleUrls: ['./listing-detail.component.css'],
})
export class ListingDetailComponent implements OnInit, OnDestroy {
  listing:     Listing | null = null;
  activeImage  = '';
  mainImageLoaded = false;
  ownerStats: OwnerStats | null = null;
  loading      = true;
  error        = '';

  showDeleteModal = false;
  deleting        = false;
  deleteError     = '';

  isLoggedIn       = false;
  isOwnerOfListing = false;

  // Live review stats for the header chip — the same source the Reviews
  // section itself uses, so the two never disagree. listing.rating/
  // listing.reviewCount don't exist on the backend Listing model at all,
  // so this replaces what was previously a chip that could never render.
  reviewStats: { avgRating: number; totalCount: number } | null = null;

  constructor(
    private route:          ActivatedRoute,
    private router:         Router,
    private listingService: ListingService,
    private authService:    AuthService,
    private chatSvc:        ChatService,
    private bookingSvc:     BookingService,
    private wishlistSvc:    WishlistService,
    private cartSvc:        CartService,
    private reviewSvc:      ReviewService,
    private titleSvc:       Title,
    private metaSvc:        Meta,
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = this.authService.isLoggedIn;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error = 'Invalid listing ID.'; this.loading = false; return; }
    this.loadListing(id);
    if (this.isLoggedIn) this.wishlistSvc.getWishlist().subscribe();
  }

  ngOnDestroy(): void {
    this.titleSvc.setTitle('Rentify PK');
  }

  loadListing(id: string): void {
    this.listingService.getListingById(id).subscribe({
      next: (res) => {
        this.listing     = res.data.listing;
        this.activeImage = this.listing.images?.[0]?.url || '';
        this.mainImageLoaded = false;
        this.loading     = false;
        this.ownerStats  = res.data.ownerStats || null;
        this.checkOwnership();
        this.ensureSelectedVehicleIsAllowed();
        this.loadReviewStats(id);
        this.updatePageMeta();
      },
      error: (err) => {
        this.error   = err.error?.message || 'Listing not found.';
        this.loading = false;
      },
    });
  }

  /** Sets the browser tab title + meta description to this listing's own
   *  details, instead of leaving the generic app title — helps both the
   *  renter (knows which tab is which) and SEO/social link previews. */
  private updatePageMeta(): void {
    if (!this.listing) return;
    const title = `${this.listing.title} — Rs ${this.listing.price} ${this.getPriceLabel(this.listing.priceUnit)} | Rentify PK`;
    this.titleSvc.setTitle(title);

    const rawDesc = this.listing.description || `Rent ${this.listing.title} in ${this.listing.city || 'Pakistan'} on Rentify PK.`;
    const description = rawDesc.length > 160 ? rawDesc.slice(0, 157) + '…' : rawDesc;
    this.metaSvc.updateTag({ name: 'description', content: description });
    this.metaSvc.updateTag({ property: 'og:title', content: title });
    this.metaSvc.updateTag({ property: 'og:description', content: description });
    if (this.activeImage) this.metaSvc.updateTag({ property: 'og:image', content: this.activeImage });
  }

  /** Pulls just the stats (avgRating/totalCount), same source as the Reviews
   *  section below, for the header's star-rating chip — page 1 of reviews
   *  always carries `stats` regardless of how many reviews actually exist. */
  private loadReviewStats(listingId: string): void {
    this.reviewSvc.getListingReviews(listingId, 1).subscribe({
      next: (res: any) => { this.reviewStats = res?.data?.stats || null; },
      error: () => { this.reviewStats = null; },
    });
  }

  // Check if the currently logged-in user is the listing owner
  checkOwnership(): void {
    const currentUser = this.authService.currentUser;
    if (!currentUser || !this.listing) return;
    const ownerId = this.getOwnerId();
    this.isOwnerOfListing = currentUser.id === ownerId || (currentUser as any)._id === ownerId;
  }

  // Resolve the owner's user ID (createdBy may be an object or a raw ID)
  getOwnerId(): string | null {
    if (!this.listing) return null;
    const o: any = this.listing.createdBy;
    return this.isOwnerObject(o) ? (o._id || o.id) : o;
  }

  // 👤 View owner's public profile (their info, listings, and reviews)
  goToOwnerProfile(): void {
    const ownerId = this.getOwnerId();
    if (!ownerId) return;
    this.router.navigate(['/owner', ownerId]);
  }

  // ── Availability calendar selection ──────────────────────────────────────────
  selectedRange: { start: Date; end: Date } | null = null;
  submitting = false;
  deliveryMethod: 'pickup' | 'delivery' = 'pickup';   // renter chooses how to receive the item
  deliveryAddress = '';   // where the rider should deliver (required for delivery)
  deliveryPhone   = '';       // contact number for the rider
  selectedVehicle: 'bike' | 'car' | 'van' = 'bike';  // vehicle type for delivery

  onRangeSelected(range: { start: Date; end: Date }): void {
    this.selectedRange = range;
  }

  // ── Booking confirmation modal: show full payment breakdown before
  //    actually creating the booking ─────────────────────────────────────────
  showBookingModal = false;
  bookingDays = 0;
  bookingSubtotal = 0;
  bookingServiceFee = 0;
  bookingDeliveryFee = 0;
  bookingDeposit = 0;
  bookingTotal = 0;
  bookingAdvancePercent = 100;
  bookingAdvanceAmount = 0;
  bookingRemainingAmount = 0;

  readonly VEHICLE_FEES: Record<'bike' | 'car' | 'van', number> = { bike: 250, car: 500, van: 999 };

  // Mirrors backend utils/vehicleEligibility.js — a bike can't carry a
  // furniture set. Category is the best available signal since listings
  // don't carry a size/weight field. Kept conservative: mixed categories
  // (Electronics, etc.) still allow all three rather than guessing wrong.
  private readonly VAN_ONLY = ['Furniture', 'Vehicles'];
  private readonly CAR_AND_VAN = ['Home Appliances', 'Party & Events', 'Musical Instruments'];

  get allowedVehicles(): Array<'bike' | 'car' | 'van'> {
    const category = this.listing?.category;
    if (this.VAN_ONLY.includes(category)) return ['van'];
    if (this.CAR_AND_VAN.includes(category)) return ['car', 'van'];
    return ['bike', 'car', 'van'];
  }

  /** Whenever the allowed set changes (e.g. listing just loaded, or the
   *  renter switches to delivery), make sure selectedVehicle isn't pointing
   *  at something no longer eligible for this listing's category. */
  ensureSelectedVehicleIsAllowed(): void {
    if (!this.allowedVehicles.includes(this.selectedVehicle)) {
      this.selectedVehicle = this.allowedVehicles[0];
    }
  }

  /** Opens the payment-breakdown confirmation modal — does NOT create the booking yet. */
  requestBooking(): void {
    if (!this.selectedRange || !this.listing) return;
    if (this.submitting) return;   // prevent double-submit

    // For door delivery, the rider needs an address + a contact number.
    if (this.deliveryMethod === 'delivery') {
      if (!this.deliveryAddress.trim() || this.deliveryAddress.trim().length < 10) {
        alert('Please enter your full delivery address (at least 10 characters).');
        return;
      }
      if (!/^03\d{9}$/.test(this.deliveryPhone.trim())) {
        alert('Please enter a valid phone (03XXXXXXXXX) for the rider to contact you.');
        return;
      }
    }

    this.calculateBookingBreakdown();
    this.showBookingModal = true;
  }

  /** Mirrors backend calcPrice() + Trust-Tiered Payment logic — preview only,
   *  the backend recalculates the authoritative figures when the booking is
   *  actually created. */
  private calculateBookingBreakdown(): void {
    if (!this.selectedRange || !this.listing) return;

    const start = this.selectedRange.start;
    const end   = this.selectedRange.end;
    const diffMs = end.getTime() - start.getTime();
    const days   = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    this.bookingDays = days;

    const pricePerUnit = this.listing.price || 0;
    const unit = this.listing.priceUnit || 'per_day';
    let units: number;
    if      (unit === 'per_week')  units = Math.ceil(days / 7);
    else if (unit === 'per_month') units = Math.ceil(days / 30);
    else                            units = days; // per_day / per_hour fallback

    this.bookingSubtotal   = pricePerUnit * units;
    this.bookingServiceFee = Math.round(this.bookingSubtotal * 0.05);
    this.bookingDeliveryFee = this.deliveryMethod === 'delivery' ? this.VEHICLE_FEES[this.selectedVehicle] : 0;
    this.bookingDeposit    = this.listing.securityDeposit || 0;

    const rentalPortion = this.bookingSubtotal + this.bookingServiceFee + this.bookingDeliveryFee;
    this.bookingTotal = rentalPortion + this.bookingDeposit;

    const owner: any = this.listing.createdBy;
    const badge = (typeof owner === 'object' ? owner?.trustBadge : null) || 'none';
    const advanceTable: Record<string, number> = { Gold: 10, Silver: 20, Bronze: 30, none: 40 };
    this.bookingAdvancePercent = advanceTable[badge] ?? 70;

    const advanceRental = Math.round(rentalPortion * this.bookingAdvancePercent / 100);
    this.bookingAdvanceAmount   = advanceRental + this.bookingDeposit;
    this.bookingRemainingAmount = Math.max(0, rentalPortion - advanceRental);
  }

  closeBookingModal(): void {
    if (this.submitting) return;   // don't let them close mid-submit
    this.showBookingModal = false;
  }

  /** Adds this configuration to the cart — called from the "Add to Cart"
   *  button inside the price-breakdown modal. Booking is no longer created
   *  directly from here; the renter reviews/pays from the cart/checkout flow. */
  confirmBooking(): void {
    if (!this.selectedRange || !this.listing) return;
    if (this.submitting) return;

    this.submitting = true;
    const id = this.listing._id || this.listing.id;
    this.cartSvc.add({
      listingId: id as string,
      startDate: this.toUtcDateString(this.selectedRange.start),
      endDate:   this.toUtcDateString(this.selectedRange.end),
      deliveryMethod:  this.deliveryMethod,
      deliveryAddress: this.deliveryMethod === 'delivery' ? this.deliveryAddress.trim() : null,
      deliveryPhone:   this.deliveryMethod === 'delivery' ? this.deliveryPhone.trim()    : null,
      vehicleType:     this.deliveryMethod === 'delivery' ? this.selectedVehicle          : null,
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.showBookingModal = false;
        this.cartSvc.openDrawer();
      },
      error: (err: any) => {
        this.submitting = false;
        alert(err?.error?.message || 'Could not add to cart. Please try again.');
      },
    });
  }

  /** Convert a locally-picked date to a UTC-midnight ISO string (no day shift). */
  private toUtcDateString(d: Date): string {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)).toISOString();
  }

  // ── Wishlist heart ───────────────────────────────────────────────────────────
  get isSaved(): boolean {
    const id = this.listing?._id || this.listing?.id;
    return id ? this.wishlistSvc.isSaved(id) : false;
  }

  toggleWishlist(): void {
    const id = this.listing?._id || this.listing?.id;
    if (!id) { alert('Listing ID missing'); return; }
    const wasSaved = this.wishlistSvc.isSaved(id);
    this.wishlistSvc.toggle(id).subscribe({
      next: () => {
        // success — signal already updated; optional toast
      },
      error: (err: any) => {
        const msg = err?.error?.message || err?.message || 'Could not update wishlist';
        alert('Wishlist error: ' + msg);
      },
    });
  }

  editListing(): void {
    const id = this.listing?.id || this.listing?._id;
    this.router.navigate(['/listings/edit', id]);
  }

  confirmDelete(): void {
    const id = this.listing?.id || this.listing?._id;
    if (!id) return;
    this.deleting     = true;
    this.deleteError  = '';
    this.listingService.deleteListing(id).subscribe({
      next: () => {
        this.deleting         = false;
        this.showDeleteModal  = false;
        this.router.navigate(['/listings']);
      },
      error: (err) => {
        this.deleting    = false;
        this.deleteError = err.error?.message || 'Failed to delete listing.';
      },
    });
  }

  // ── Display Helpers ────────────────────────────────────────────────────────
  getPriceLabel(unit: string): string {
    return PRICE_UNIT_LABELS[unit as keyof typeof PRICE_UNIT_LABELS] || '';
  }

  isOwnerObject(owner: any): owner is ListingOwner {
    return owner && typeof owner === 'object';
  }

  getOwnerInitial(owner: any): string {
    return typeof owner === 'object' && owner?.name ? owner.name.charAt(0).toUpperCase() : '?';
  }

  getOwnerName(owner: any): string {
    return typeof owner === 'object' ? owner?.name || 'Unknown' : 'Unknown';
  }

  getOwnerSince(owner: any): string {
    if (typeof owner === 'object' && owner?.createdAt) {
      return new Date(owner.createdAt).getFullYear().toString();
    }
    return '';
  }

  getOwnerCnic(owner: any): boolean {
    return typeof owner === 'object' && !!owner?.cnicVerified;
  }

  getOwnerTrustBadge(owner: any): string {
    return typeof owner === 'object' ? (owner?.trustBadge || 'none') : 'none';
  }

  getOwnerTrustScore(owner: any): number | null {
    return typeof owner === 'object' && owner?.trustScore != null ? owner.trustScore : null;
  }

  // ── Image gallery ────────────────────────────────────────────────────────────
  setActiveImage(url: string): void {
    if (url === this.activeImage) return;
    this.activeImage = url;
    this.mainImageLoaded = false;
  }

  onMainImageLoad(): void { this.mainImageLoaded = true; }

  lightboxOpen = false;
  lightboxIndex = 0;
  lightboxZoom = 1;
  get galleryImages(): string[] {
    return (this.listing?.images || []).map((im: any) => im?.url || im).filter((u: any) => !!u);
  }
  openLightbox(startIndex = 0): void {
    if (!this.galleryImages.length) return;
    this.lightboxIndex = startIndex; this.lightboxZoom = 1; this.lightboxOpen = true;
    document.body.style.overflow = 'hidden';
  }
  closeLightbox(): void { this.lightboxOpen = false; this.lightboxZoom = 1; document.body.style.overflow = ''; }
  lbNext(e?: Event): void { if (e) e.stopPropagation(); this.lightboxIndex = (this.lightboxIndex + 1) % this.galleryImages.length; this.lightboxZoom = 1; }
  lbPrev(e?: Event): void { if (e) e.stopPropagation(); this.lightboxIndex = (this.lightboxIndex - 1 + this.galleryImages.length) % this.galleryImages.length; this.lightboxZoom = 1; }
  lbZoomIn(e?: Event):  void { if (e) e.stopPropagation(); this.lightboxZoom = Math.min(this.lightboxZoom + 0.4, 3); }
  lbZoomOut(e?: Event): void { if (e) e.stopPropagation(); this.lightboxZoom = Math.max(this.lightboxZoom - 0.4, 1); }

  get relatedListings(): any[] { return (this.listing as any)?.related || []; }

  goToListing(l: any): void {
    const id = l._id || l.id;
    this.router.navigate(['/listings', id]).then(() => {
      window.scrollTo({ top: 0 });
      this.loading = true;
      this.reviewStats = null;
      this.ownerStats = null;
      this.selectedRange = null;
      this.loadListing(id);
    });
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const ph = img.nextElementSibling as HTMLElement | null;
    if (ph) ph.style.display = 'flex';
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.lightboxOpen) return;
    if (e.key === 'Escape')          this.closeLightbox();
    else if (e.key === 'ArrowRight') this.lbNext();
    else if (e.key === 'ArrowLeft')  this.lbPrev();
    else if (e.key === '+' || e.key === '=') this.lbZoomIn();
    else if (e.key === '-')          this.lbZoomOut();
  }

  // ── Message the owner ────────────────────────────────────────────────────────
  // Single chat system: this starts (or finds the existing) conversation for
  // this renter + this owner + this listing, then routes straight into the
  // full /messages inbox — no separate inline-drawer chat to keep in sync.
  // The listing reference is persisted on the conversation server-side, so
  // its context (title + thumbnail) still shows in the message header and
  // links back here — see chat.component.html's "Re: <listing>" chip.
  messagingOwner = false;

  messageOwner(): void {
    if (!this.isLoggedIn) { this.router.navigate(['/auth/login']); return; }
    if (this.messagingOwner) return;
    const ownerId   = this.getOwnerId();
    const listingId = this.listing?._id || this.listing?.id;
    if (!ownerId) return;

    this.messagingOwner = true;
    this.chatSvc.startConversation(ownerId, listingId as string).subscribe({
      next: (res: any) => {
        this.messagingOwner = false;
        const conv = res?.data?.conversation || res?.data;
        const conversationId = res?.data?.conversationId || conv?._id || conv?.id;
        this.router.navigate(['/messages', conversationId]);
      },
      error: () => {
        this.messagingOwner = false;
        this.router.navigate(['/messages']); // fall back to the inbox even if start failed
      },
    });
  }

  // ── Quick-chat suggested questions (sidebar panel) ──────────────────────────
  // Same single-chat-system pattern as messageOwner(): start/find the
  // conversation, but also send the tapped suggestion as the first message,
  // then land the renter straight in the thread with it already sent.
  readonly quickQuestions = [
    'Is this item still available?',
    'Can you share more details?',
    "What's included in the setup?",
  ];

  sendQuickMessage(text: string): void {
    if (!this.isLoggedIn) { this.router.navigate(['/auth/login']); return; }
    if (this.messagingOwner) return;
    const ownerId   = this.getOwnerId();
    const listingId = this.listing?._id || this.listing?.id;
    if (!ownerId) return;

    this.messagingOwner = true;
    this.chatSvc.startConversation(ownerId, listingId as string).subscribe({
      next: (res: any) => {
        const conv = res?.data?.conversation || res?.data;
        const conversationId = res?.data?.conversationId || conv?._id || conv?.id;
        this.chatSvc.send({
          conversationId, recipientId: ownerId, content: text, listingId: listingId as string,
        }).subscribe({
          next: () => { this.messagingOwner = false; this.router.navigate(['/messages', conversationId]); },
          error: () => { this.messagingOwner = false; this.router.navigate(['/messages', conversationId]); },
        });
      },
      error: () => {
        this.messagingOwner = false;
        this.router.navigate(['/messages']);
      },
    });
  }
}
