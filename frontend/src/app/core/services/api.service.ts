import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(path: string, params: Record<string, any> = {}): Observable<T> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        httpParams = httpParams.set(k, String(v));
      }
    });
    return this.http.get<T>(`${this.baseUrl}${path}`, { params: httpParams });
  }

  post<T>(path: string, body: any = {}): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body);
  }

  put<T>(path: string, body: any = {}): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body);
  }

  patch<T>(path: string, body: any = {}): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body);
  }

  /**
   * `body` is optional — when provided (e.g. { mode: 'everyone' } for
   * message deletion), Angular's HttpClient requires it under the
   * `options.body` key for DELETE requests, since DELETE doesn't take a
   * body as a positional argument like POST/PUT do.
   */
  delete<T>(path: string, body?: any): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, body ? { body } : {});
  }

  upload<T>(path: string, formData: FormData): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, formData);
  }

  uploadPut<T>(path: string, formData: FormData): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, formData);
  }
}
