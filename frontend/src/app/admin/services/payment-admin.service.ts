// src/app/admin/services/payment-admin.service.ts
/**
 * PaymentAdminService — Rentify PK admin
 * Wraps the payment verification endpoints (payment.routes.js):
 *   GET   /api/payments/bank-transfer/pending      → pending proofs (all methods)
 *   PATCH /api/payments/bank-transfer/:ref/verify  → approve
 *   PATCH /api/payments/bank-transfer/:ref/reject  → reject { reason }
 * (JWT is attached automatically by the auth interceptor.)
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PaymentAdminService {
  private api = `${environment.apiUrl}/payments/bank-transfer`;

  constructor(private http: HttpClient) {}

  getPending(): Observable<any> {
    return this.http.get(`${this.api}/pending`);
  }
  verify(reference: string): Observable<any> {
    return this.http.patch(`${this.api}/${encodeURIComponent(reference)}/verify`, {});
  }
  reject(reference: string, reason: string): Observable<any> {
    return this.http.patch(`${this.api}/${encodeURIComponent(reference)}/reject`, { reason });
  }
}
