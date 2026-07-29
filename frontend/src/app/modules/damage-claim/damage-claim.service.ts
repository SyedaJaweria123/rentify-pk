import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export type ClaimStatus = 'pending' | 'accepted' | 'disputed' | 'resolved' | 'rejected';
export type RenterResponse = 'accepted' | 'disputed';
export type AdminDecision = 'resolve' | 'reject';

/**
 * Carried from InspectionComparisonComponent → DamageClaimCreateComponent
 * (via query params: fromInspection=1, summary, recommendedDeduction,
 * damageDelta, inspectionReportId) when an owner files a claim straight off
 * the AI delivery↔return comparison. Pre-fills the form and is sent along
 * with the claim submission so admin can see the AI's read alongside the
 * owner's own (editable) description/cost — it's reference context only,
 * never a substitute for the human-entered fields.
 */
export interface SourceInspection {
  inspectionReport: string | null;
  damageDelta: number | null;
  recommendedDeduction: number | null;
  summary: string;
}

@Injectable({ providedIn: 'root' })
export class DamageClaimService {
  constructor(private api: ApiService) {}

  /** Owner files a claim (multipart: photos[], videos[], bookingId, description, estimatedCost). */
  create(formData: FormData): Observable<any> {
    return this.api.upload('/damage-claims', formData);
  }

  /** Single claim detail (party or admin). */
  getOne(claimId: string): Observable<any> {
    return this.api.get(`/damage-claims/${claimId}`);
  }

  /** Find an existing claim for a booking, if one was filed. 404s if none exists. */
  getByBooking(bookingId: string): Observable<any> {
    return this.api.get(`/damage-claims/by-booking/${bookingId}`);
  }

  /** Admin list, optional ?status= filter. */
  list(status: string = ''): Observable<any> {
    return this.api.get('/damage-claims', status ? { status } : {});
  }

  /** Renter accepts or disputes the claim. */
  respond(claimId: string, response: RenterResponse, note: string = ''): Observable<any> {
    return this.api.patch(`/damage-claims/${claimId}/respond`, { response, note });
  }

  /** Admin resolves (deduct amount) or rejects. */
  resolve(claimId: string, decision: AdminDecision, amount: number, note: string = ''): Observable<any> {
    return this.api.patch(`/damage-claims/${claimId}/resolve`, { decision, amount, note });
  }
}
