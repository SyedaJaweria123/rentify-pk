import { Component, OnInit, effect } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { CartService, CartItem } from './cart.service';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <!-- Backdrop -->
    <div class="cd-backdrop" *ngIf="cartSvc.drawerOpen()" (click)="close()"></div>

    <!-- Drawer panel — always in the DOM so translateX actually animates;
         pointer-events disabled while closed so it can't be interacted with
         or focused off-screen. -->
    <aside class="cd-panel" [class.open]="cartSvc.drawerOpen()">
      <div class="cd-head">
        <h2 class="cd-title">Shopping Cart</h2>
        <button class="cd-close" (click)="close()" aria-label="Close cart">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="cd-body">
        <div class="cd-loading" *ngIf="loading">
          <div class="cd-spin"></div>
        </div>

        <div class="cd-empty" *ngIf="!loading && items.length === 0">
          <span class="cd-empty-icon">🛒</span>
          <p>Your cart is empty</p>
          <button class="cd-browse-btn" (click)="browseListings()">Browse Listings</button>
        </div>

        <div class="cd-item" *ngFor="let item of items" [class.unavailable]="item.unavailable">
          <div class="cd-item-img">
            <img *ngIf="getImage(item)" [src]="getImage(item)" [alt]="item.listing?.title" (error)="onImgError($event)"/>
            <div class="cd-no-img" [style.display]="getImage(item) ? 'none' : 'flex'">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
          </div>

          <div class="cd-item-info">
            <p class="cd-item-title">{{ item.listing?.title || 'Listing unavailable' }}</p>
            <p class="cd-item-owner" *ngIf="!item.unavailable">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {{ getOwnerName(item) }}
            </p>
            <p class="cd-item-dates" *ngIf="!item.unavailable">
              {{ formatDate(item.startDate) }} → {{ formatDate(item.endDate) }}
            </p>
            <p class="cd-item-unavailable" *ngIf="item.unavailable">No longer available</p>
            <p class="cd-item-price" *ngIf="item.pricing">Rs {{ item.pricing.totalAmount | number }}</p>

          </div>

          <button class="cd-item-remove" (click)="remove(item)" [disabled]="removingId === item.id" aria-label="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
          </button>
        </div>
      </div>

      <div class="cd-footer" *ngIf="!loading && items.length > 0">
        <div class="cd-subtotal-row">
          <span>Subtotal:</span>
          <span class="cd-subtotal-val">Rs {{ subtotal | number }}</span>
        </div>
        <button class="cd-btn cd-btn-outline" (click)="viewCheckout()">View Cart</button>
        <button class="cd-btn cd-btn-primary" (click)="checkout()">Checkout</button>
        <button class="cd-btn cd-btn-link" (click)="close()">Continue Shopping</button>
      </div>
    </aside>
  `,
  styleUrls: ['./cart-drawer.component.css'],
})
export class CartDrawerComponent implements OnInit {
  items: CartItem[] = [];
  loading = false;
  removingId: string | null = null;

  constructor(
    public cartSvc: CartService,
    private router: Router,
  ) {
    // Reload fresh contents every time the drawer opens, so prices/
    // availability never go stale while it was closed.
    effect(() => {
      if (this.cartSvc.drawerOpen()) this.load();
    });
  }

  ngOnInit(): void {}

  private load(): void {
    this.loading = true;
    this.cartSvc.getCart().subscribe({
      next: (res: any) => {
        this.items = res?.data?.items || [];
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get subtotal(): number {
    return this.items
      .filter(i => !i.unavailable && i.pricing)
      .reduce((sum, i) => sum + (i.pricing?.totalAmount || 0), 0);
  }

  close(): void { this.cartSvc.closeDrawer(); }

  remove(item: CartItem): void {
    this.removingId = item.id;
    this.cartSvc.remove(item.id).subscribe({
      next: () => {
        this.items = this.items.filter(i => i.id !== item.id);
        this.removingId = null;
      },
      error: () => { this.removingId = null; },
    });
  }

  viewCheckout(): void {
    this.close();
    this.router.navigate(['/cart/checkout']);
  }

  checkout(): void {
    this.close();
    this.router.navigate(['/cart/checkout']);
  }

  browseListings(): void {
    this.close();
    this.router.navigate(['/listings']);
  }

  getImage(item: CartItem): string {
    return item.listing?.images?.[0]?.url || '';
  }

  getOwnerName(item: CartItem): string {
    const o = item.listing?.createdBy;
    return (o && typeof o === 'object' ? o.name : null) || 'Unknown owner';
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const ph = img.nextElementSibling as HTMLElement | null;
    if (ph) ph.style.display = 'flex';
  }
}
