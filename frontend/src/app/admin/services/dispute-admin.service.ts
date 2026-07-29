import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DisputeAdminService {
  private api = `${environment.apiUrl}/disputes`;

  constructor(private http: HttpClient) {}

  list(params: { status?: string; page?: number; limit?: number } = {}): Observable<any> {
    let hp = new HttpParams();
    Object.keys(params).forEach(k => {
      const v = (params as any)[k];
      if (v !== '' && v != null) hp = hp.set(k, v);
    });
    return this.http.get(this.api, { params: hp });
  }

  getById(disputeId: string): Observable<any> {
    return this.http.get(`${this.api}/${disputeId}`);
  }

  resolve(disputeId: string, resolution: 'favor_renter' | 'favor_owner' | 'split' | 'dismissed', note?: string): Observable<any> {
    return this.http.patch(`${this.api}/${disputeId}/resolve`, { resolution, note });
  }
}
