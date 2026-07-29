import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export type InspectionType = 'delivery' | 'return';
export type PhotoAngle = 'front' | 'back' | 'left' | 'right' | 'top' | 'detail';

export interface InspectionPhoto {
  url: string;
  publicId: string;
  angle: PhotoAngle;
}

@Injectable({ providedIn: 'root' })
export class InspectionService {
  constructor(private api: ApiService) {}

  /** Upload one image → { url, publicId } (reused generic uploads endpoint). */
  uploadImage(formData: FormData): Observable<any> {
    return this.api.upload('/uploads/image', formData);
  }

  /** Submit delivery inspection (rider). photos: [{url, publicId, angle}] */
  submitDelivery(bookingId: string, photos: InspectionPhoto[], notes = '', videoUrl = ''): Observable<any> {
    return this.api.post(`/inspections/delivery/${bookingId}`, { photos, notes, videoUrl });
  }

  /** Submit return inspection (renter). */
  submitReturn(bookingId: string, photos: InspectionPhoto[], notes = '', videoUrl = ''): Observable<any> {
    return this.api.post(`/inspections/return/${bookingId}`, { photos, notes, videoUrl });
  }

  /** Submit pickup inspection (rider, collecting from the owner). */
  submitPickup(bookingId: string, photos: InspectionPhoto[], notes = '', videoUrl = ''): Observable<any> {
    return this.api.post(`/inspections/pickup/${bookingId}`, { photos, notes, videoUrl });
  }

  /** Submit return-pickup inspection (rider, collecting back from the renter). */
  submitReturnPickup(bookingId: string, photos: InspectionPhoto[], notes = '', videoUrl = ''): Observable<any> {
    return this.api.post(`/inspections/return-pickup/${bookingId}`, { photos, notes, videoUrl });
  }

  /** Submit return-delivery inspection (rider, handing back to the owner). */
  submitReturnDelivery(bookingId: string, photos: InspectionPhoto[], notes = '', videoUrl = ''): Observable<any> {
    return this.api.post(`/inspections/return-delivery/${bookingId}`, { photos, notes, videoUrl });
  }

  /** Fetch any single leg's report: pickup | delivery | return_pickup | return | return_delivery */
  getLeg(type: string, bookingId: string): Observable<any> {
    return this.api.get(`/inspections/leg/${type}/${bookingId}`);
  }

  /** Every delivery/return proof across every booking I'm part of (owner or renter). */
  getMyInspections(page = 1, limit = 12): Observable<any> {
    return this.api.get('/inspections/my', { page, limit });
  }

  getDelivery(bookingId: string): Observable<any> {
    return this.api.get(`/inspections/delivery/${bookingId}`);
  }
  getReturn(bookingId: string): Observable<any> {
    return this.api.get(`/inspections/return/${bookingId}`);
  }

  /** AI comparison of delivery vs return. */
  compare(bookingId: string): Observable<any> {
    return this.api.get(`/inspections/compare/${bookingId}`);
  }

  /** Every leg comparison for a booking (pickup→delivery, delivery→return_pickup, …). */
  allComparisons(bookingId: string): Observable<any> {
    return this.api.get(`/inspections/all-comparisons/${bookingId}`);
  }

  /** One leg's comparison — used by the page shown right after that handover. */
  legResult(type: string, bookingId: string): Observable<any> {
    return this.api.get(`/inspections/leg-result/${type}/${bookingId}`);
  }
}
