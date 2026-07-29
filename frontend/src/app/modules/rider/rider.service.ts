import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export type AssignmentStatus =
  | 'assigned' | 'accepted' | 'declined' | 'picked_up' | 'delivered' | 'completed' | 'cancelled';

export type RiderBadge = 'none' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface Evidence { url: string; publicId: string; }

@Injectable({ providedIn: 'root' })
export class RiderService {
  constructor(private api: ApiService) {}

  getAssignments(filter: 'active' | 'completed' | '' = ''): Observable<any> {
    return this.api.get('/rider/assignments', filter ? { filter } : {});
  }

  /** Pending return-type assignments — rider delivered something, now needs to collect it back. */
  getPendingReturns(): Observable<any> {
    return this.api.get('/rider/assignments', { filter: 'pending_returns' });
  }

  /** Today/week/month/total earnings, pending payout, delivery counts, rating. */
  getEarnings(): Observable<any> {
    return this.api.get('/rider/earnings');
  }

  getAssignment(id: string): Observable<any> {
    return this.api.get(`/rider/assignments/${id}`);
  }

  accept(id: string): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/accept`, {});
  }

  /** Decline an offered assignment — the backend automatically dispatches
   *  it to another available rider so it doesn't stay stuck. */
  decline(id: string, reason?: string): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/decline`, reason ? { reason } : {});
  }

  pickup(id: string, evidence: Evidence[], qrCode: string): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/pickup`, { evidence, qrCode });
  }

  deliver(id: string, evidence: Evidence[], location?: { lat: number; lng: number }): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/deliver`, { evidence, location });
  }

  complete(id: string): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/complete`, {});
  }

  /** Mark the renter's remaining booking balance as collected (cash or wallet). */
  collectRemaining(id: string, method: 'cash' | 'wallet'): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/collect-remaining`, { method });
  }

  /** Flag that the renter refused to pay the remaining balance at handover. */
  markRefused(id: string): Observable<any> {
    return this.api.patch(`/rider/assignments/${id}/refused`, {});
  }

  scanQR(qrCode: string, lat?: number, lng?: number): Observable<any> {
    return this.api.post('/rider/scan-qr', { qrCode, lat, lng });
  }

  setAvailability(isAvailable: boolean): Observable<any> {
    return this.api.patch('/rider/availability', { isAvailable });
  }

  updateLocation(lat: number, lng: number): Observable<any> {
    return this.api.patch('/rider/location', { lat, lng });
  }
}
