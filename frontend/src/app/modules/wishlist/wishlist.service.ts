// src/app/modules/wishlist/wishlist.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private api = `${environment.apiUrl}/wishlist`;

  // Set of listing IDs currently in the wishlist (for instant heart toggle)
  private ids = signal<Set<string>>(new Set());

  constructor(private http: HttpClient) {}

  /** Load wishlist listings (also refreshes the id set) */
  getWishlist(): Observable<any> {
    return this.http.get<any>(this.api).pipe(
      tap(res => {
        const listings = res?.data?.listings || [];
        this.ids.set(new Set(listings.map((l: any) => l._id || l.id)));
      })
    );
  }

  add(listingId: string): Observable<any> {
    return this.http.post<any>(this.api, { listingId }).pipe(
      tap(() => { const s = new Set(this.ids()); s.add(listingId); this.ids.set(s); })
    );
  }

  remove(listingId: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/${listingId}`).pipe(
      tap(() => { const s = new Set(this.ids()); s.delete(listingId); this.ids.set(s); })
    );
  }

  isSaved(listingId: string): boolean {
    return this.ids().has(listingId);
  }

  /** Toggle and return the resulting Observable */
  toggle(listingId: string): Observable<any> {
    return this.isSaved(listingId) ? this.remove(listingId) : this.add(listingId);
  }
}
