// src/app/admin/services/admin.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private api = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getDashboardStats(): Observable<any> {
    return this.http.get(`${this.api}/stats`);
  }

  getRevenueChart(period = 'monthly'): Observable<any> {
    return this.http.get(`${this.api}/charts/revenue`, { params: { period } });
  }

  getBookingsChart(period = 'monthly'): Observable<any> {
    return this.http.get(`${this.api}/charts/bookings`, { params: { period } });
  }

  getUserGrowthChart(): Observable<any> {
    return this.http.get(`${this.api}/charts/users`);
  }

  getCategoryChart(): Observable<any> {
    return this.http.get(`${this.api}/charts/categories`);
  }

  getCnicStatusChart(): Observable<any> {
    return this.http.get(`${this.api}/charts/cnic-status`);
  }

  getFaceMatchChart(): Observable<any> {
    return this.http.get(`${this.api}/charts/face-match`);
  }

  getRecentActivity(): Observable<any> {
    return this.http.get(`${this.api}/activity?limit=10`);
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers(params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/users`, { params });
  }

  getUserById(id: string): Observable<any> {
    return this.http.get(`${this.api}/users/${id}`);
  }

  updateUser(id: string, data: any): Observable<any> {
    return this.http.put(`${this.api}/users/${id}`, data);
  }

  suspendUser(id: string, reason: string): Observable<any> {
    return this.http.put(`${this.api}/users/${id}/suspend`, { reason });
  }

  unsuspendUser(id: string): Observable<any> {
    return this.http.put(`${this.api}/users/${id}/unsuspend`, {});
  }

  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.api}/users/${id}`);
  }

  verifyCNIC(userId: string, approved: boolean, reason?: string): Observable<any> {
    return this.http.put(`${this.api}/users/${userId}/verify-cnic`, { approved, reason });
  }

  approveOwner(userId: string, approved: boolean): Observable<any> {
    return this.http.put(`${this.api}/users/${userId}/approve-owner`, { approved });
  }

  // ── Listings ──────────────────────────────────────────────────────────────
  getListings(params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/listings`, { params });
  }

  updateListingStatus(id: string, status: string): Observable<any> {
    return this.http.put(`${this.api}/listings/${id}/status`, { status });
  }

  deleteListing(id: string): Observable<any> {
    return this.http.delete(`${this.api}/listings/${id}`);
  }

  // ── Bookings ──────────────────────────────────────────────────────────────
  getBookings(params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/bookings`, { params });
  }

  updateBookingStatus(id: string, status: string): Observable<any> {
    return this.http.put(`${this.api}/bookings/${id}/status`, { status });
  }

  // ── Revenue ───────────────────────────────────────────────────────────────
  getTransactions(params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/transactions`, { params });
  }

  getRevenueSummary(): Observable<any> {
    return this.http.get(`${this.api}/revenue/summary`);
  }

  getPlatformWallet(params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/platform-wallet`, { params });
  }

  withdrawPlatformFunds(data: { amount: number; method: string; accountNumber: string }): Observable<any> {
    return this.http.post(`${this.api}/platform-wallet/withdraw`, data);
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  sendAnnouncement(data: { title: string; body: string; targetRole?: string }): Observable<any> {
    return this.http.post(`${this.api}/notifications/announce`, data);
  }

  getAnnouncementHistory(): Observable<any> {
    return this.http.get(`${this.api}/notifications/history`);
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  // JSON report rows for on-screen preview (export is done client-side)
  getReport(type: string, params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/reports/${type}`, { params });
  }

  // ── Analytics (top cities + top owners) ─────────────────────────────────────
  getAnalytics(): Observable<any> {
    return this.http.get(`${this.api}/analytics`);
  }

  exportReport(type: string, format: string, params: any = {}): Observable<Blob> {
    return this.http.get(`${this.api}/reports/${type}`, {
      params: { ...params, format },
      responseType: 'blob',
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings(): Observable<any> {
    return this.http.get(`${this.api}/settings`);
  }

  updateSettings(data: any): Observable<any> {
    return this.http.put(`${this.api}/settings`, data);
  }

  forceLogoutAll(): Observable<any> {
    return this.http.post(`${this.api}/force-logout`, {});
  }

  // ── Activity Logs ─────────────────────────────────────────────────────────
  getActivityLogs(params: any = {}): Observable<any> {
    return this.http.get(`${this.api}/activity-logs`, { params });
  }

  // ── Contact form messages ──
  getContactMessages(): Observable<any> {
    return this.http.get(`${this.api}/contact-messages`);
  }
  markContactMessageRead(id: string, isRead: boolean): Observable<any> {
    return this.http.patch(`${this.api}/contact-messages/${id}/read`, { isRead });
  }
  deleteContactMessage(id: string): Observable<any> {
    return this.http.delete(`${this.api}/contact-messages/${id}`);
  }
}
