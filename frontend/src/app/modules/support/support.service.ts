import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserSupportService {
  private api = `${environment.apiUrl}/support`;

  constructor(private http: HttpClient) {}

  createTicket(data: FormData): Observable<any> {
    return this.http.post(`${this.api}/create-ticket`, data);
  }

  myTickets(params: any = {}): Observable<any> {
    let hp = new HttpParams();
    Object.keys(params).forEach(k => {
      if (params[k] !== '' && params[k] != null) hp = hp.set(k, String(params[k]));
    });
    return this.http.get(`${this.api}`, { params: hp });
  }

  myTicketDetail(id: string): Observable<any> {
    return this.http.get(`${this.api}/${id}`);
  }
}
