import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

export interface RentifyUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'renter';
  avatar: string | null;
  isEmailVerified: boolean;
  cnicVerified: boolean;
  walletBalance: number;
  permissions: string[];
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private _user = signal<RentifyUser | null>(this.loadUserFromStorage());

  readonly currentUser  = this._user.asReadonly();
  readonly isLoggedIn   = computed(() => !!this._user());
  readonly isOwner      = computed(() => this._user()?.role === 'owner');
  readonly isRenter     = computed(() => this._user()?.role === 'renter');
  readonly walletBalance = computed(() => this._user()?.walletBalance ?? 0);

  constructor(private router: Router) {}

  setUser(user: RentifyUser, accessToken: string, refreshToken?: string): void {
    this._user.set(user);
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('rentify_user', JSON.stringify(user));
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
  }

  updateUser(partial: Partial<RentifyUser>): void {
    const cur = this._user();
    if (!cur) return;
    const updated = { ...cur, ...partial };
    this._user.set(updated);
    localStorage.setItem('rentify_user', JSON.stringify(updated));
  }

  updateWalletBalance(balance: number): void {
    this.updateUser({ walletBalance: balance });
  }

  logout(): void {
    this._user.set(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('rentify_user');
    this.router.navigate(['/auth/login']);
  }

  hasPermission(permission: string): boolean {
    return this._user()?.permissions?.includes(permission) ?? false;
  }

  private loadUserFromStorage(): RentifyUser | null {
    try {
      const raw = localStorage.getItem('rentify_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
