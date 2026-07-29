import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

/**
 * Switch Account Banner
 * ─────────────────────────────────────────────────────────────────────────────
 * Three states:
 *
 *  1. Renter/Owner WITH linked rider account
 *     → "Switch to Rider Account" (green)
 *
 *  2. Rider WITH linked primary account
 *     → "Switch to Main Account" (blue)
 *
 *  3. Rider WITHOUT linked primary account (old-system riders)
 *     → "Create Main Account" button — creates a linked renter account
 *        then switches to it automatically
 *
 * Shows nothing for renter/owner who have no linked rider account yet
 * (they should use /become-rider instead).
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Component({
  selector: 'app-switch-account-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container [ngSwitch]="bannerState">

      <!-- State 1: Renter/Owner → switch to rider -->
      <div *ngSwitchCase="'to_rider'" class="sab-banner sab-rider">
        <div class="sab-left">
          <span class="sab-icon">🛵</span>
          <div>
            <p class="sab-title">Switch to Rider Account</p>
            <p class="sab-sub">Manage your deliveries and earnings</p>
          </div>
        </div>
        <button class="sab-btn sab-btn-rider" (click)="switchAccount()" [disabled]="busy()">
          {{ busy() ? 'Switching…' : 'Switch' }}
          <svg *ngIf="!busy()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <!-- State 2: Rider → switch to primary -->
      <div *ngSwitchCase="'to_primary'" class="sab-banner sab-primary">
        <div class="sab-left">
          <span class="sab-icon">🏠</span>
          <div>
            <p class="sab-title">Switch to Main Account</p>
            <p class="sab-sub">Go back to your Renter / Owner dashboard</p>
          </div>
        </div>
        <button class="sab-btn sab-btn-primary" (click)="switchAccount()" [disabled]="busy()">
          {{ busy() ? 'Switching…' : 'Switch' }}
          <svg *ngIf="!busy()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

    </ng-container>

    <p *ngIf="error()" class="sab-error">{{ error() }}</p>
  `,
  styles: [`
    :host { display: block; margin-bottom: 20px; font-family: 'Poppins','Inter',system-ui,sans-serif; }

    .sab-banner {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 14px 18px; border-radius: 14px; border: 1.5px solid transparent;
    }
    .sab-rider  { background: #EAF3DE; border-color: #d3e6c2; }
    .sab-primary { background: #f0f9ff; border-color: #bae6fd; }

    .sab-left { display: flex; align-items: center; gap: 12px; }
    .sab-icon { font-size: 22px; line-height: 1; flex-shrink: 0; }
    .sab-title { font-size: 14px; font-weight: 700; color: #111827; margin: 0; }
    .sab-sub   { font-size: 12px; color: #6b7280; margin: 2px 0 0; }

    .sab-btn {
      flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px;
      padding: 9px 18px; border-radius: 10px; border: none;
      font-size: 13px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: background .15s; white-space: nowrap;
    }
    .sab-btn:disabled { opacity: .6; cursor: not-allowed; }
    .sab-btn-rider  { background: #1F5435; color: #fff; }
    .sab-btn-rider:hover:not(:disabled) { background: #143524; }
    .sab-btn-primary { background: #0284c7; color: #fff; }
    .sab-btn-primary:hover:not(:disabled) { background: #0369a1; }

    .sab-error { font-size: 12.5px; color: #dc2626; margin: 8px 0 0; }
  `],
})
export class SwitchAccountBannerComponent {
  busy  = signal(false);
  error = signal('');

  constructor(public auth: AuthService, private router: Router) {}

  get bannerState(): 'to_rider' | 'to_primary' | 'none' {
    const u = this.auth.currentUser;
    if (!u) return 'none';
    if (u.role === 'rider') {
      if (u.linkedPrimaryAccountId) return 'to_primary';
      return 'none';
    }
    if (u.linkedRiderAccountId) return 'to_rider';
    return 'none';
  }

  switchAccount(): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.auth.switchAccount().subscribe({
      next: (res) => {
        this.busy.set(false);
        const role = res?.data?.switchedTo || this.auth.currentUser?.role;
        this.router.navigate([role === 'rider' ? '/rider/dashboard' : '/dashboard']);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message || 'Could not switch. Please try again.');
      },
    });
  }
}
