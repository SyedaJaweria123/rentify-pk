import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TrustBreakdownItem {
  earned: number;
  max: number;
  [key: string]: any;
}

export interface TrustScore {
  ownerId: string;
  name?: string;
  avatar?: string;
  trustScore: number;
  trustBadge: 'none' | 'Bronze' | 'Silver' | 'Gold';
  updatedAt?: string;
  breakdown?: Record<string, TrustBreakdownItem> | null;
}

@Injectable({ providedIn: 'root' })
export class TrustService {
  private api = `${environment.apiUrl}/trust`;

  constructor(private http: HttpClient) {}

  /** Public: get an owner's trust score + badge. */
  getOwnerTrust(ownerId: string): Observable<{ success: boolean; data: TrustScore }> {
    return this.http.get<{ success: boolean; data: TrustScore }>(`${this.api}/${ownerId}`);
  }

  /** Owner: recalculate own score (returns full breakdown). */
  recalculateMine(): Observable<{ success: boolean; data: any }> {
    return this.http.post<{ success: boolean; data: any }>(`${this.api}/me/recalc`, {});
  }
}
