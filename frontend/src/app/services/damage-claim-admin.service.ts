import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DamageClaimAdminService {
  private api = `${environment.apiUrl}/damage-claims`;

  constructor(private http: HttpClient) {}

  /** List all claims (admin), optional status + pagination. */
  list(opts: { status?: string; page?: number; limit?: number } = {}): Observable<any> {
    const params: any = {};
    if (opts.status) params.status = opts.status;
    if (opts.page)   params.page = String(opts.page);
    if (opts.limit)  params.limit = String(opts.limit);
    return this.http.get(this.api, { params });
  }

  getOne(claimId: string): Observable<any> {
    return this.http.get(`${this.api}/${claimId}`);
  }

  resolve(claimId: string, decision: 'resolve' | 'reject', amount: number, note = ''): Observable<any> {
    return this.http.patch(`${this.api}/${claimId}/resolve`, { decision, amount, note });
  }
}
