import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * ErrorBannerComponent — Rentify PK
 * Fixed-position banner that auto-dismisses after 5 seconds.
 *
 * Usage:
 *   <app-error-banner
 *     message="Listing not found."
 *     type="error"
 *     (dismissed)="error = ''">
 *   </app-error-banner>
 */
@Component({
  selector: 'app-error-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="visible && message"
      class="banner"
      [class.banner-error]="type === 'error'"
      [class.banner-success]="type === 'success'"
      [class.banner-warning]="type === 'warning'"
      [class.banner-info]="type === 'info'"
      role="alert">

      <!-- Icon -->
      <span class="banner-icon">
        {{ type === 'error' ? '⚠️' : type === 'success' ? '✅' : type === 'warning' ? '🔔' : 'ℹ️' }}
      </span>

      <!-- Message -->
      <span class="banner-msg">{{ message }}</span>

      <!-- Progress bar (auto-dismiss countdown) -->
      <div class="banner-progress" *ngIf="autoDismiss">
        <div class="banner-progress-fill" [style.animation-duration]="dismissMs + 'ms'"></div>
      </div>

      <!-- Close button -->
      <button class="banner-close" (click)="dismiss()" aria-label="Dismiss">✕</button>
    </div>
  `,
  styles: [`
    .banner {
      position: fixed;
      top: 72px; left: 50%;
      transform: translateX(-50%);
      z-index: 9000;
      min-width: 320px; max-width: 560px;
      border-radius: 12px;
      padding: 14px 44px 14px 16px;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.12);
      animation: bannerIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
      overflow: hidden;
    }
    @keyframes bannerIn {
      from { opacity:0; transform:translate(-50%,-20px) scale(0.95); }
      to   { opacity:1; transform:translate(-50%,0)     scale(1); }
    }

    /* Types */
    .banner-error   { background:#FEF2F2; border:1px solid #FECACA; color:#B91C1C; }
    .banner-success { background:#F0FDF4; border:1px solid #BBF7D0; color:#15803D; }
    .banner-warning { background:#FFFBEB; border:1px solid #FDE68A; color:#92400E; }
    .banner-info    { background:#EFF6FF; border:1px solid #BFDBFE; color:#1E40AF; }

    /* Dark mode */
    :host-context([data-theme="dark"]) .banner-error   { background:#2a1515; border-color:#7f1d1d; color:#fca5a5; }
    :host-context([data-theme="dark"]) .banner-success { background:#052e16; border-color:#166534; color:#4ade80; }
    :host-context([data-theme="dark"]) .banner-warning { background:#2a1f08; border-color:#78350f; color:#fbbf24; }
    :host-context([data-theme="dark"]) .banner-info    { background:#0c1a3d; border-color:#1e3a8a; color:#60a5fa; }

    .banner-icon { font-size: 18px; flex-shrink: 0; }
    .banner-msg  { flex: 1; font-size: 14px; font-weight: 600; line-height: 1.4; }

    /* Auto-dismiss progress bar */
    .banner-progress { position:absolute; bottom:0; left:0; right:0; height:3px; background:rgba(0,0,0,0.1); }
    .banner-progress-fill {
      height: 100%; width: 100%;
      background: currentColor; opacity: 0.4;
      animation: progressShrink linear forwards;
    }
    @keyframes progressShrink {
      from { width: 100%; }
      to   { width: 0%; }
    }

    .banner-close {
      position: absolute; top: 10px; right: 10px;
      background: none; border: none; cursor: pointer;
      font-size: 14px; color: inherit; opacity: 0.6;
      width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.15s, background 0.15s;
    }
    .banner-close:hover { opacity: 1; background: rgba(0,0,0,0.1); }
  `],
})
export class ErrorBannerComponent implements OnInit, OnDestroy {
  @Input() message    = '';
  @Input() type: 'error' | 'success' | 'warning' | 'info' = 'error';
  @Input() autoDismiss = true;
  @Input() dismissMs   = 5000;

  @Output() dismissed = new EventEmitter<void>();

  visible    = true;
  private timer: any;

  ngOnInit(): void {
    if (this.autoDismiss && this.message) {
      this.timer = setTimeout(() => this.dismiss(), this.dismissMs);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  dismiss(): void {
    this.visible = false;
    this.dismissed.emit();
  }
}
