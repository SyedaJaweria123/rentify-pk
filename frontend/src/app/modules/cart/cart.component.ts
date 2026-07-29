import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CartService, CartItem, CartTotals } from './cart.service';
import { PRICE_UNIT_LABELS } from '../../models/listing.model';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe, DecimalPipe],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css'],
})
export class CartComponent implements OnInit {
  items: CartItem[] = [];
  totals: CartTotals | null = null;
  validCount = 0;

  loading = true;
  error = '';

  // Per-item busy state so one item's update spinner doesn't block the rest
  busyItemId: string | null = null;

  // Selection for partial checkout — every valid item is selected by default
  selected: Set<string> = new Set();

  checkingOut = false;
  checkoutError = '';
  checkoutResult: { created: any[]; failed: { itemId: string; reason: string }[] } | null = null;

  // Remove-confirmation state (per-item)
  confirmRemoveId: string | null = null;
  cartClearConfirm = false;

  readonly VEHICLE_FEES: Record<'bike' | 'car' | 'van', number> = { bike: 250, car: 500, van: 999 };

  // Mirrors backend utils/vehicleEligibility.js — a bike can't carry a
  // furniture set. Used to filter which vehicle buttons show per cart line.
  private readonly VAN_ONLY = ['Furniture', 'Vehicles'];
  private readonly CAR_AND_VAN = ['Home Appliances', 'Party & Events', 'Musical Instruments'];

  allowedVehiclesFor(item: CartItem): Array<'bike' | 'car' | 'van'> {
    const category = item.listing?.category;
    if (this.VAN_ONLY.includes(category)) return ['van'];
    if (this.CAR_AND_VAN.includes(category)) return ['car', 'van'];
    return ['bike', 'car', 'van'];
  }

  constructor(
    private cartSvc: CartService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cartSvc.getCart().subscribe({
      next: (res: any) => {
        this.items = res?.data?.items || [];
        this.totals = res?.data?.totals || null;
        this.validCount = res?.data?.validCount ?? 0;
        // Default: select every bookable item
        this.selected = new Set(this.items.filter(i => !i.unavailable).map(i => i.id));
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Could not load your cart.';
        this.loading = false;
      },
    });
  }

  retry(): void { this.load(); }

  trackByItemId(_index: number, item: CartItem): string { return item.id; }

  /** True when this is the first cart line (in current order) for its
   *  owner — used to render a one-time owner-group header rather than
   *  repeating the owner's name as a section divider on every item. */
  isFirstItemForOwner(item: CartItem): boolean {
    const ownerId = this.getOwnerId(item);
    if (!ownerId) return false;
    const idx = this.items.findIndex(i => this.getOwnerId(i) === ownerId);
    return this.items[idx]?.id === item.id;
  }

  private getOwnerId(item: CartItem): string | null {
    const o = item.listing?.createdBy;
    return (o && typeof o === 'object' ? (o._id || o.id) : null) || null;
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  isSelected(item: CartItem): boolean { return this.selected.has(item.id); }

  toggleSelect(item: CartItem): void {
    if (item.unavailable) return;
    const s = new Set(this.selected);
    if (s.has(item.id)) s.delete(item.id); else s.add(item.id);
    this.selected = s;
  }

  get allSelected(): boolean {
    const selectable = this.items.filter(i => !i.unavailable);
    return selectable.length > 0 && selectable.every(i => this.selected.has(i.id));
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.selected = new Set();
    } else {
      this.selected = new Set(this.items.filter(i => !i.unavailable).map(i => i.id));
    }
  }

  get selectedCount(): number { return this.selected.size; }

  /** Sum of totals across only the currently-selected, bookable items. */
  get selectedTotals(): CartTotals {
    const empty: CartTotals = { subtotal: 0, serviceFee: 0, deliveryFee: 0, deposit: 0, total: 0, advance: 0, remaining: 0 };
    return this.items
      .filter(i => !i.unavailable && this.selected.has(i.id) && i.pricing)
      .reduce((acc, i) => {
        const p = i.pricing!;
        acc.subtotal    += p.subtotal;
        acc.serviceFee  += p.serviceFee;
        acc.deliveryFee += p.deliveryFee;
        acc.deposit     += p.depositAmount;
        acc.total       += p.totalAmount;
        acc.advance     += p.advanceAmount;
        acc.remaining   += p.remainingAmount;
        return acc;
      }, empty);
  }

  // ── Quantity (always 1 in a rental marketplace — see info note in UI) ──────
  // Rental listings book for an exact date range, never a multiplied
  // quantity — "quantity" here is really "is this line included at
  // checkout", handled by the selection checkboxes above.

  // ── Date editing per line ───────────────────────────────────────────────────
  onDateChange(item: CartItem, field: 'startDate' | 'endDate', value: string): void {
    if (!value) return;
    const payload: any = { [field]: value };
    // Guard: if the new start would be >= current end (or vice versa), bump
    // the other date by one day so the range always stays valid client-side
    // before the backend's own validation runs.
    const start = field === 'startDate' ? new Date(value) : new Date(item.startDate);
    const end   = field === 'endDate'   ? new Date(value) : new Date(item.endDate);
    if (start >= end) {
      if (field === 'startDate') {
        const bumped = new Date(start); bumped.setDate(bumped.getDate() + 1);
        payload.endDate = bumped.toISOString();
      } else {
        const bumped = new Date(end); bumped.setDate(bumped.getDate() - 1);
        payload.startDate = bumped.toISOString();
      }
    }
    item.startDate = payload.startDate || (field === 'startDate' ? value : item.startDate);
    item.endDate   = payload.endDate   || (field === 'endDate'   ? value : item.endDate);
    this.patchItem(item, payload);
  }

  onDeliveryMethodChange(item: CartItem, method: 'pickup' | 'delivery'): void {
    if (method === 'delivery') {
      const allowed = this.allowedVehiclesFor(item);
      const vehicle = allowed.includes(item.vehicleType as any) ? item.vehicleType : allowed[0];
      item.deliveryMethod = method;
      item.vehicleType = vehicle;
      this.patchItem(item, { deliveryMethod: method, vehicleType: vehicle });
    } else {
      item.deliveryMethod = method;
      item.vehicleType = null;
      this.patchItem(item, { deliveryMethod: method });
    }
  }

  onVehicleChange(item: CartItem, vehicle: 'bike' | 'car' | 'van'): void {
    item.vehicleType = vehicle;
    item.deliveryMethod = 'delivery';
    this.patchItem(item, { vehicleType: vehicle, deliveryMethod: 'delivery' });
  }

  onAddressBlur(item: CartItem, address: string): void {
    if (item.deliveryMethod === 'delivery') this.patchItem(item, { deliveryAddress: address });
  }

  onPhoneBlur(item: CartItem, phone: string): void {
    if (item.deliveryMethod === 'delivery') this.patchItem(item, { deliveryPhone: phone });
  }

  private patchItem(item: CartItem, payload: any): void {
    this.busyItemId = item.id;
    this.cartSvc.update(item.id, payload).subscribe({
      next: () => {
        this.busyItemId = null;
        // Refresh pricing/availability only — merged into the existing item
        // objects rather than replacing the whole array, so an in-flight
        // edit on a different field (or even the same field, mid-typing)
        // never gets clobbered by a reload that started before it.
        this.refreshPricingOnly();
      },
      error: (err: any) => {
        this.busyItemId = null;
        alert(err?.error?.message || 'Could not update this item.');
        this.load(); // a failed save really did leave state stale — full reload is correct here
      },
    });
  }

  /** Re-pulls the cart and merges pricing/availability/server-confirmed
   *  fields into the existing item objects (by id) instead of replacing the
   *  array outright — keeps any field the user is actively editing intact. */
  private refreshPricingOnly(): void {
    this.cartSvc.getCart().subscribe({
      next: (res: any) => {
        const fresh: CartItem[] = res?.data?.items || [];
        const byId = new Map(fresh.map(f => [f.id, f]));
        this.items = this.items.map(existing => {
          const f = byId.get(existing.id);
          if (!f) return existing; // item was removed server-side elsewhere — keep as-is, load() elsewhere will reconcile
          return { ...existing, pricing: f.pricing, unavailable: f.unavailable };
        });
        this.totals = res?.data?.totals || this.totals;
        this.validCount = res?.data?.validCount ?? this.validCount;
      },
      error: () => { /* keep current optimistic state — non-critical refresh */ },
    });
  }

  // ── Remove ───────────────────────────────────────────────────────────────────
  askRemove(item: CartItem): void { this.confirmRemoveId = item.id; }
  cancelRemove(): void { this.confirmRemoveId = null; }

  confirmRemove(item: CartItem): void {
    this.busyItemId = item.id;
    this.cartSvc.remove(item.id).subscribe({
      next: () => {
        this.confirmRemoveId = null;
        this.busyItemId = null;
        this.items = this.items.filter(i => i.id !== item.id);
        const s = new Set(this.selected); s.delete(item.id); this.selected = s;
        this.recomputeTotalsLocally();
      },
      error: (err: any) => {
        this.busyItemId = null;
        alert(err?.error?.message || 'Could not remove this item.');
      },
    });
  }

  private recomputeTotalsLocally(): void {
    const t = this.selectedTotals;
    // Keep the header summary roughly in sync until the next full reload;
    // the authoritative numbers always come from the backend on load().
    this.totals = t;
    this.validCount = this.items.filter(i => !i.unavailable).length;
  }

  // ── Checkout ─────────────────────────────────────────────────────────────────
  /** A delivery item missing its address/phone can't actually be booked yet
   *  — surfaced inline so the renter sees it before clicking checkout,
   *  rather than only finding out from a generic failure afterward. */
  isIncompleteDelivery(item: CartItem): boolean {
    if (item.deliveryMethod !== 'delivery') return false;
    const addrOk  = !!item.deliveryAddress && item.deliveryAddress.trim().length >= 10;
    const phoneOk = /^03\d{9}$/.test(String(item.deliveryPhone || '').trim());
    return !addrOk || !phoneOk;
  }

  get hasIncompleteSelectedItems(): boolean {
    return this.items.some(i => this.selected.has(i.id) && this.isIncompleteDelivery(i));
  }

  get canCheckout(): boolean {
    return this.selectedCount > 0 && !this.checkingOut && !this.hasIncompleteSelectedItems;
  }

  doClearCart(): void {
    this.cartClearConfirm = false;
    this.cartSvc.clear().subscribe({
      next: () => {
        this.items = [];
        this.selected = new Set();
        this.totals = null;
        this.validCount = 0;
      },
      error: (err: any) => alert(err?.error?.message || 'Could not clear cart.'),
    });
  }

  checkout(): void {
    if (!this.canCheckout) return;

    // The address/phone inputs only save on (blur). If the renter types an
    // address and clicks "Proceed to Checkout" directly, blur never fires and
    // the server still has the OLD (empty) address — so checkout fails with
    // "Please add a full delivery address" even though the field looks filled.
    // Flush any selected delivery lines first, then check out for real.
    const pending = this.items.filter(i =>
      this.selected.has(i.id) && i.deliveryMethod === 'delivery'
      && ((i.deliveryAddress || '').trim().length > 0 || (i.deliveryPhone || '').trim().length > 0)
    );

    if (pending.length === 0) { this.doCheckout(); return; }

    this.checkingOut = true;
    this.checkoutError = '';
    let done = 0;
    let failedFlush = false;

    pending.forEach(item => {
      // Send only the fields that actually have a value — a blank one would be
      // rejected with 422 and block the whole checkout.
      const payload: any = {};
      if ((item.deliveryAddress || '').trim()) payload.deliveryAddress = item.deliveryAddress;
      if ((item.deliveryPhone || '').trim())   payload.deliveryPhone   = item.deliveryPhone;

      this.cartSvc.update(item.id, payload).subscribe({
        next: () => { if (++done === pending.length) { this.checkingOut = false; if (!failedFlush) this.doCheckout(); } },
        error: (err: any) => {
          failedFlush = true;
          if (++done === pending.length) {
            this.checkingOut = false;
            this.checkoutError = err?.error?.message || 'Could not save your delivery details. Please try again.';
          }
        },
      });
    });
  }

  private doCheckout(): void {
    this.checkingOut = true;
    this.checkoutError = '';
    this.checkoutResult = null;

    this.cartSvc.checkout(Array.from(this.selected)).subscribe({
      next: (res: any) => {
        this.checkingOut = false;
        this.checkoutResult = {
          created: res?.data?.created || [],
          failed: res?.data?.failed || [],
        };
        // Drop the successfully-booked lines from view; failed ones stay so
        // the renter can fix dates/delivery and try again.
        const failedIds = new Set(this.checkoutResult.failed.map(f => f.itemId));
        this.items = this.items.filter(i => failedIds.has(i.id));
        this.selected = new Set();
      },
      error: (err: any) => {
        this.checkingOut = false;
        // A 409 means every line was rejected — the server still sends the
        // per-item reasons in data.failed, so show those instead of the generic
        // "No items could be booked." which tells the renter nothing about
        // WHAT to fix (bad dates, missing address, own listing, etc).
        const failed = err?.error?.data?.failed || [];
        if (failed.length > 0) {
          this.checkoutResult = { created: [], failed };
          this.checkoutError = '';
        } else {
          this.checkoutError = err?.error?.message || 'Checkout failed. Please try again.';
        }
      },
    });
  }

  goToBooking(bookingId: string): void {
    this.router.navigate(['/bookings', bookingId]);
  }

  /** Resolve a failed line's listing title so the reason names the actual item. */
  failedItemTitle(itemId: string): string {
    const line = this.items.find(i => i.id === itemId);
    return line?.listing?.title || 'Item';
  }

  goToBookings(): void {
    this.router.navigate(['/bookings']);
  }

  // ── Display helpers ─────────────────────────────────────────────────────────
  getPriceUnitLabel(unit: string): string {
    return PRICE_UNIT_LABELS[unit as keyof typeof PRICE_UNIT_LABELS] || '';
  }

  getListingImage(listing: any): string {
    return listing?.images?.[0]?.url || '';
  }

  getOwnerName(listing: any): string {
    const o = listing?.createdBy;
    return (o && typeof o === 'object' ? o.name : null) || 'Unknown owner';
  }

  todayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const ph = img.nextElementSibling as HTMLElement | null;
    if (ph) ph.style.display = 'flex';
  }
}
