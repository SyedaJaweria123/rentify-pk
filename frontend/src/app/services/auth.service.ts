import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { User, TOKEN_KEY, REFRESH_KEY, USER_KEY } from '../models/auth.model';
import { environment } from '../../environments/environment';
import { SocketService } from '../core/services/socket.service';
import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = environment.apiUrl;
  private userSubject = new BehaviorSubject<User | null>(this.storedUser());
  currentUser$ = this.userSubject.asObservable();

  constructor(private http: HttpClient, private router: Router, private socket: SocketService) {}

  get currentUser(): User | null { return this.userSubject.value; }
  get isLoggedIn(): boolean      { return !!this.currentUser && !!this.getToken(); }
  get isOwner(): boolean         { return this.currentUser?.role === 'owner'; }

  getToken():        string | null { return localStorage.getItem(TOKEN_KEY); }
  getRefreshToken(): string | null { return localStorage.getItem(REFRESH_KEY); }

  private storedUser(): User | null {
    try { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; } catch { return null; }
  }

  setSession(data: { user: User; accessToken: string; refreshToken: string }): void {
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    this.userSubject.next(data.user);
    this.socket.connect();   // open real-time connection on login
  }

  handleSocialCallback(token: string, refresh: string): Observable<any> {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refresh);
    return this.http.get(`${this.api}/auth/me`).pipe(
      tap((res: any) => {
        if (res.success) { localStorage.setItem(USER_KEY, JSON.stringify(res.data.user)); this.userSubject.next(res.data.user); }
      })
    );
  }

  googleOneTap(credential: string): Observable<any> {
    return this.http.post(`${this.api}/auth/google-onetap`, { credential }).pipe(
      tap((res: any) => { if (res.success) this.setSession(res.data); })
    );
  }

  // Separate register endpoints for renter and owner
  registerRenter(body: any): Observable<any> { return this.http.post(`${this.api}/auth/register/renter`, body); }

  checkEmailExists(email: string): Observable<any> {
    return this.http.post(`${this.api}/auth/check-email`, { email });
  }
  registerOwner(body: any): Observable<any>  { return this.http.post(`${this.api}/auth/register/owner`, body); }
  registerRider(body: any): Observable<any>  { return this.http.post(`${this.api}/auth/register/rider`, body); }
  scanCNIC(formData: FormData): Observable<any> { return this.http.post(`${this.api}/cnic/scan`, formData); }

  // Legacy register (defaults to renter)
  register(body: any): Observable<any> { return this.http.post(`${this.api}/auth/register/renter`, body); }
  

  verifyEmail(token: string): Observable<any>        { return this.http.get(`${this.api}/auth/verify-email?token=${token}`); }
  verifyRegistrationOTP(email: string, otp: string): Observable<any> {
    return this.http.post(`${this.api}/auth/verify-registration-otp`, { email, otp });
  }
  resendVerification(email: string): Observable<any> { return this.http.post(`${this.api}/auth/resend-verification`, { email }); }

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.api}/auth/login`, { email, password }).pipe(
      tap((res: any) => { if (res.success) this.setSession(res.data); })
    );
  }

  logout(): void {
    this.http.post(`${this.api}/auth/logout`, {}).subscribe({ error: () => {} });
    [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
    this.userSubject.next(null);
    this.socket.disconnect();   // close real-time connection
    this.router.navigate(['/']);
  }

  refreshToken(): Observable<any> {
    return this.http.post(`${this.api}/auth/refresh`, { refreshToken: this.getRefreshToken() }).pipe(
      tap((res: any) => {
        if (res.success) { localStorage.setItem(TOKEN_KEY, res.data.accessToken); localStorage.setItem(REFRESH_KEY, res.data.refreshToken); }
      })
    );
  }

  forgotPassword(email: string): Observable<any>         { return this.http.post(`${this.api}/auth/forgot-password`, { email }); }
  verifyOTP(email: string, otp: string): Observable<any> { return this.http.post(`${this.api}/auth/verify-otp`, { email, otp }); }
  resetPassword(body: any): Observable<any>              { return this.http.post(`${this.api}/auth/reset-password`, body); }
  validateCNIC(cnicNumber: string): Observable<any>      { return this.http.post(`${this.api}/auth/validate-cnic`, { cnicNumber }); }
  getLoginHistory(): Observable<any>                     { return this.http.get(`${this.api}/auth/login-history`); }
  /** Public owner-profile card — no auth required. */
  getPublicProfile(userId: string): Observable<any>      { return this.http.get(`${this.api}/auth/public-profile/${userId}`); }
  upgradeToOwner(body: any): Observable<any>             { return this.http.post(`${this.api}/auth/upgrade-to-owner`, body); }
  upgradeToRider(body: any): Observable<any>             { return this.http.post(`${this.api}/auth/upgrade-to-rider`, body); }

  /**
   * Switch between linked accounts (renter/owner ↔ rider) without a full
   * login. The backend issues a new token for the linked account; we apply
   * it via setSession() so the entire app (navbar, guards, everything) picks
   * up the new identity immediately.
   */
  switchAccount(): Observable<any> {
    return this.http.post<any>(`${this.api}/auth/switch-account`, {}).pipe(
      tap((res: any) => {
        if (res.success) this.setSession(res.data);
      })
    );
  }

  /** For old-system riders who have no linked primary account yet — creates one. */
  createLinkedPrimary(): Observable<any> {
    return this.http.post<any>(`${this.api}/auth/create-linked-primary`, {});
  }
  /** This user's referral code + real stats (people referred, reward earned). */
  getReferralInfo(): Observable<any>                     { return this.http.get(`${this.api}/auth/referral`); }

  // ── Device Biometric Login (WebAuthn) ────────────────────────────────────
  /** Does this browser/device support biometric login at all? Check before
   *  showing any biometric UI — older browsers and some desktop setups don't. */
  async webauthnSupported(): Promise<boolean> {
    if (!browserSupportsWebAuthn()) return false;
    try { return await platformAuthenticatorIsAvailable(); } catch { return false; }
  }

  getWebauthnDevices(): Observable<any> {
    return this.http.get(`${this.api}/auth/webauthn/devices`);
  }

  removeWebauthnDevice(credentialId: string): Observable<any> {
    return this.http.delete(`${this.api}/auth/webauthn/devices/${encodeURIComponent(credentialId)}`);
  }

  /** Registers THIS device for biometric login. Must already be logged in
   *  (via password) — prompts the OS fingerprint/Face ID dialog via the
   *  browser's native WebAuthn API, then sends the result to the backend. */
  async registerBiometric(deviceLabel?: string): Promise<{ success: boolean; message: string }> {
    const optionsRes: any = await this.http.post(`${this.api}/auth/webauthn/register-options`, {}).toPromise();
    if (!optionsRes?.success) throw new Error(optionsRes?.message || 'Could not start registration.');

    const attestation = await startRegistration({ optionsJSON: optionsRes.data });

    const verifyRes: any = await this.http.post(`${this.api}/auth/webauthn/register-verify`, {
      response: attestation,
      deviceLabel: deviceLabel || this.guessDeviceLabel(),
    }).toPromise();
    if (!verifyRes?.success) throw new Error(verifyRes?.message || 'Could not verify this device.');
    return verifyRes;
  }

  /** Logs in using this device's registered biometric credential — no
   *  password typed. Returns the same shape as login(), and calls
   *  setSession() on success just like a normal password login would. */
  async loginWithBiometric(email: string): Promise<any> {
    const optionsRes: any = await this.http.post(`${this.api}/auth/webauthn/login-options`, { email }).toPromise();
    if (!optionsRes?.success) throw new Error(optionsRes?.message || 'Biometric login is not set up for this account.');

    const assertion = await startAuthentication({ optionsJSON: optionsRes.data });

    const verifyRes: any = await this.http.post(`${this.api}/auth/webauthn/login-verify`, {
      email, response: assertion,
    }).toPromise();
    if (!verifyRes?.success) throw new Error(verifyRes?.message || 'Biometric login failed.');

    this.setSession(verifyRes.data);
    return verifyRes;
  }

  /** Best-effort human-readable label for "which device is this" — shown in
   *  the device-management list so a user can tell their phone from their
   *  laptop without us needing real device fingerprinting. */
  private guessDeviceLabel(): string {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isMac = /Macintosh/.test(ua);
    const isWindows = /Windows/.test(ua);
    const browser = /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : 'Browser';
    if (isIOS) return `iPhone/iPad — ${browser}`;
    if (isAndroid) return `Android — ${browser}`;
    if (isMac) return `Mac — ${browser}`;
    if (isWindows) return `Windows — ${browser}`;
    return browser;
  }

  getMe(): Observable<any> {
    return this.http.get(`${this.api}/auth/me`).pipe(
      tap((res: any) => {
        if (res.success) { localStorage.setItem(USER_KEY, JSON.stringify(res.data.user)); this.userSubject.next(res.data.user); }
      })
    );
  }

  // Update user in memory + localStorage (e.g. after avatar/profile update)
  updateUser(partial: Partial<User>): void {
    const current = this.userSubject.value;
    if (!current) return;
    const updated = { ...current, ...partial };
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    this.userSubject.next(updated);
  }

  googleLoginUrl():   string { return `${this.api}/auth/google`; }
  facebookLoginUrl(): string { return `${this.api}/auth/facebook`; }
  oauthStatus(): Observable<any> { return this.http.get(`${this.api}/auth/oauth-status`); }
}