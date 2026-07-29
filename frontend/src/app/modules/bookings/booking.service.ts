import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export interface BookingCreatePayload {
  listingId: string;
  startDate: string;
  endDate: string;
  message?: string;
  deliveryMethod?: 'pickup' | 'delivery';
  deliveryAddress?: string;
}

export interface AvailabilityPayload {
  listingId: string;
  startDate: string;
  endDate: string;
}

export interface BookingFilters {
  page?: number;
  limit?: number;
  status?: string;
  role?: 'owner' | 'renter';
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  constructor(private api: ApiService) {}

  checkAvailability(payload: AvailabilityPayload): Observable<any> {
    return this.api.post('/bookings/check-availability', payload);
  }

  create(payload: BookingCreatePayload): Observable<any> {
    return this.api.post('/bookings', payload);
  }

  getAll(filters: BookingFilters = {}): Observable<any> {
    return this.api.get('/bookings', filters as any);
  }

  getById(id: string): Observable<any> {
    return this.api.get(`/bookings/${id}`);
  }

  confirm(id: string): Observable<any> {
    return this.api.put(`/bookings/${id}/confirm`);
  }

  reject(id: string, reason: string): Observable<any> {
    return this.api.put(`/bookings/${id}/reject`, { reason });
  }

  cancel(id: string, reason: string): Observable<any> {
    return this.api.put(`/bookings/${id}/cancel`, { reason });
  }

  complete(id: string, force = false): Observable<any> {
    return this.api.put(`/bookings/${id}/complete${force ? '?force=1' : ''}`);
  }

  collectRemaining(id: string, method: 'cash' | 'wallet' = 'cash'): Observable<any> {
    return this.api.put(`/bookings/${id}/collect-remaining`, { method });
  }

  dispute(id: string, reason: string): Observable<any> {
    return this.api.put(`/bookings/${id}/dispute`, { reason });
  }

  /** Manually dispatch the return-leg rider to collect the item (delivery bookings). */
  requestReturn(id: string): Observable<any> {
    return this.api.put(`/bookings/${id}/request-return`, {});
  }
}
