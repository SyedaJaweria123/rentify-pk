// src/app/admin/services/cnic-admin.service.ts
/**
 * CnicAdminService — Rentify PK admin
 * Wraps the existing CNIC admin endpoints (cnic.routes.js):
 *   GET  /api/cnic/admin/queue   → pending CNIC submissions (with image URLs)
 *   POST /api/cnic/admin/verify  → approve  { userId }
 *   POST /api/cnic/admin/reject  → reject   { userId, reason }
 * (JWT is attached automatically by the auth interceptor.)
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CnicAdminService {
  private api = `${environment.apiUrl}/cnic/admin`;

  constructor(private http: HttpClient) {}

  getQueue(): Observable<any> {
    return this.http.get(`${this.api}/queue`);
  }
  verify(userId: string): Observable<any> {
    return this.http.post(`${this.api}/verify`, { userId });
  }
  reject(userId: string, reason: string): Observable<any> {
    return this.http.post(`${this.api}/reject`, { userId, reason });
  }
}
