import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Listing, ListingFilters, ListingsResponse, CategoryCount, OwnerStats,
} from '../models/listing.model';

@Injectable({ providedIn: 'root' })
export class ListingService {
  private api = `${environment.apiUrl}/listings`;

  constructor(private http: HttpClient) {}

  // ── Browse listings (public) ───────────────────────────────────────────────
  getListings(filters: ListingFilters = {}): Observable<{ success: boolean; data: ListingsResponse }> {
    let params = new HttpParams();
    if (filters.search)   params = params.set('search',   filters.search);
    if (filters.category) params = params.set('category', filters.category);
    if (filters.minPrice != null) params = params.set('minPrice', filters.minPrice.toString());
    if (filters.maxPrice != null) params = params.set('maxPrice', filters.maxPrice.toString());
    if (filters.city)     params = params.set('city',     filters.city);
    if (filters.sortBy)   params = params.set('sortBy',   filters.sortBy);
    if (filters.order)    params = params.set('order',    filters.order);
    if (filters.page)     params = params.set('page',     filters.page.toString());
    if (filters.limit)    params = params.set('limit',    filters.limit.toString());
    return this.http.get<any>(this.api, { params });
  }

  /** Fetch active listings near a point (uses backend 2dsphere geo query). */
  getNearby(lat: number, lng: number, radiusKm = 25, category?: string): Observable<{ success: boolean; data: any }> {
    let params = new HttpParams()
      .set('lat', String(lat))
      .set('lng', String(lng))
      .set('radius', String(radiusKm));
    if (category) params = params.set('category', category);
    return this.http.get<any>(`${this.api}/nearby`, { params });
  }

  // ── Get single listing by ID ───────────────────────────────────────────────
  getListingById(id: string): Observable<{ success: boolean; data: { listing: Listing; related?: Listing[]; ownerStats?: OwnerStats | null } }> {
    return this.http.get<any>(`${this.api}/${id}`);
  }

  // ── My listings (authenticated) ───────────────────────────────────────────
  getMyListings(page = 1, limit = 10, status = 'all'): Observable<{ success: boolean; data: ListingsResponse }> {
    const params = new HttpParams()
      .set('page',  page.toString())
      .set('limit', limit.toString())
      .set('status', status);
    return this.http.get<any>(`${this.api}/user/my`, { params });
  }

  // ── Public: all of a given owner's active listings (owner-profile page) ──
  getByOwner(ownerId: string, page = 1, limit = 12): Observable<{ success: boolean; data: ListingsResponse }> {
    const params = new HttpParams()
      .set('page',  page.toString())
      .set('limit', limit.toString());
    return this.http.get<any>(`${this.api}/owner/${ownerId}`, { params });
  }

  // ── Categories with counts ─────────────────────────────────────────────────
  getCategories(): Observable<{ success: boolean; data: { categories: CategoryCount[] } }> {
    return this.http.get<any>(`${this.api}/categories`);
  }

  // ── Create listing (multipart/form-data) ───────────────────────────────────
  createListing(formData: FormData): Observable<{ success: boolean; message: string; data: { listing: Listing } }> {
    return this.http.post<any>(this.api, formData);
    // Note: Do NOT set Content-Type header — let browser set multipart boundary
  }

  // ── Update listing (multipart/form-data) ───────────────────────────────────
  updateListing(id: string, formData: FormData): Observable<{ success: boolean; message: string; data: { listing: Listing } }> {
    return this.http.put<any>(`${this.api}/${id}`, formData);
  }

  // ── Delete listing ─────────────────────────────────────────────────────────
  deleteListing(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<any>(`${this.api}/${id}`);
  }

  // ── Helper: get listing ID regardless of _id or id field ──────────────────
  getListingId(listing: Listing): string {
    return (listing.id || listing._id) as string;
  }
}
