import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AppNotification {
  _id:       string;
  title:     string;
  body:      string;
  type:      string;
  isRead:    boolean;
  readAt?:   string;
  createdAt: string;
  meta?: { bookingId?: string; listingId?: string; reviewId?: string; userId?: string; link?: string; ticketId?: string; };
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  unreadCount = signal<number>(0);
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}

  /** Set right before navigating to /notifications/:id so the detail page can
   *  render instantly without a network round-trip; the detail page falls
   *  back to fetching the list itself if this is empty (e.g. on a hard refresh
   *  or a shared link). */
  selected = signal<AppNotification | null>(null);
  setSelected(n: AppNotification): void { this.selected.set(n); }

  /** Look up a single notification by id from the list endpoint — there's no
   *  dedicated single-item route on the backend, so we page through recent
   *  notifications and find it client-side. Good enough for a detail view
   *  that's normally reached by clicking the item (which already has the
   *  object in memory via `selected`). */
  getById(id: string): Observable<AppNotification | undefined> {
    return this.getAll(1, 100).pipe(
      map((res: any) => (res?.data?.notifications || []).find((n: AppNotification) => n._id === id))
    );
  }

  getAll(page = 1, limit = 20): Observable<any> {
    const params = new HttpParams().set('page', page.toString()).set('limit', limit.toString());
    return this.http.get(`${this.api}/notifications`, { params }).pipe(
      tap((res: any) => { if (res?.data?.unreadCount !== undefined) this.unreadCount.set(res.data.unreadCount); })
    );
  }
  markRead(id: string): Observable<any> {
    return this.http.put(`${this.api}/notifications/${id}/read`, {}).pipe(
      tap(() => { const c = this.unreadCount(); if (c > 0) this.unreadCount.set(c - 1); })
    );
  }
  markAllRead(): Observable<any> {
    return this.http.put(`${this.api}/notifications/read-all`, {}).pipe(tap(() => this.unreadCount.set(0)));
  }
  delete(id: string): Observable<any> { return this.http.delete(`${this.api}/notifications/${id}`); }
  refreshCount(): void {
    this.http.get<any>(`${this.api}/notifications`, { params: new HttpParams().set('limit', '1') }).subscribe({
      next: (res) => { if (res?.data?.unreadCount !== undefined) this.unreadCount.set(res.data.unreadCount); },
    });
  }
}
