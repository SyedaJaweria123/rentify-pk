import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupportService {
  private api = `${environment.apiUrl}/support`;

  constructor(private http: HttpClient) {}

  listTickets(params: any = {}): Observable<any> {
    let hp = new HttpParams();
    Object.keys(params).forEach(k => {
      if (params[k] !== '' && params[k] != null) hp = hp.set(k, params[k]);
    });
    return this.http.get(`${this.api}/admin/support-tickets`, { params: hp });
  }

  getTicket(id: string): Observable<any> {
    return this.http.get(`${this.api}/admin/support-tickets/${id}`);
  }

  updateStatus(id: string, status: string, internalNotes?: string): Observable<any> {
    return this.http.put(`${this.api}/admin/support-tickets/${id}/status`, { status, internalNotes });
  }

  reply(id: string, reply: string, status?: string): Observable<any> {
    return this.http.post(`${this.api}/admin/support-tickets/${id}/reply`, { reply, status });
  }
}
