import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CartLinePricing {
  days: number;
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  depositAmount: number;
  totalAmount: number;
  advancePercent: number;
  advanceAmount: number;
  remainingAmount: number;
}

export interface CartItem {
  id: string;
  listing: any | null;
  startDate: string;
  endDate: string;
  deliveryMethod: 'pickup' | 'delivery';
  vehicleType: 'bike' | 'car' | 'van' | null;
  deliveryAddress: string | null;
  deliveryPhone: string | null;
  message: string | null;
  unavailable: boolean;
  pricing: CartLinePricing | null;
}

export interface CartTotals {
  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  deposit: number;
  total: number;
  advance: number;
  remaining: number;
}

export interface AddToCartPayload {
  listingId: string;
  startDate: string;
  endDate: string;
  deliveryMethod: 'pickup' | 'delivery';
  vehicleType?: 'bike' | 'car' | 'van' | null;
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  message?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private api = `${environment.apiUrl}/cart`;

  // Mirrors wishlist.service.ts's pattern: a small reactive signal so the
  // navbar badge and any "is this in my cart" checks update instantly
  // without every consumer re-fetching the whole cart.
  count = signal(0);

  // Drawer visibility — opened only from the navbar cart icon, never
  // automatically on "Add to Cart" (that just shows inline button feedback).
  drawerOpen = signal(false);
  openDrawer(): void { this.drawerOpen.set(true); }
  closeDrawer(): void { this.drawerOpen.set(false); }

  constructor(private http: HttpClient) {}

  /** Load the full cart with live pricing (also refreshes the count badge). */
  getCart(): Observable<any> {
    return this.http.get<any>(this.api).pipe(
      tap(res => this.count.set(res?.data?.count ?? 0))
    );
  }

  add(payload: AddToCartPayload): Observable<any> {
    return this.http.post<any>(this.api, payload).pipe(
      tap(() => this.count.update(c => c + 1))
    );
  }

  update(itemId: string, payload: Partial<AddToCartPayload>): Observable<any> {
    return this.http.patch<any>(`${this.api}/${itemId}`, payload);
  }

  remove(itemId: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/${itemId}`).pipe(
      tap(() => this.count.update(c => Math.max(0, c - 1)))
    );
  }

  clear(): Observable<any> {
    return this.http.delete<any>(this.api).pipe(
      tap(() => this.count.set(0))
    );
  }

  /** Checkout some (or all, if itemIds omitted) cart lines into real bookings. */
  checkout(itemIds?: string[]): Observable<any> {
    return this.http.post<any>(`${this.api}/checkout`, itemIds?.length ? { itemIds } : {}).pipe(
      tap(() => this.refreshCount())
    );
  }

  /** Re-sync the badge count without pulling full cart data — used after checkout. */
  refreshCount(): void {
    this.getCart().subscribe({ error: () => {} });
  }
}
