import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * PageLoadingComponent — Full-page spinner overlay
 *
 * Usage:
 *   <app-page-loading *ngIf="loading" message="Loading listings…"></app-page-loading>
 */
@Component({
  selector: 'app-page-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-loading-overlay">
      <div class="pl-spinner"></div>
      <div class="pl-brand">
        <span class="pl-logo">🏠</span>
        <span class="pl-name">Rentify</span>
      </div>
      <p class="pl-msg" *ngIf="message">{{ message }}</p>
    </div>
  `,
  styles: [`
    .page-loading-overlay {
      position: fixed; inset: 0; z-index: 9998;
      background: var(--bg-base, #f8fafc);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 20px;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    .pl-spinner {
      width: 52px; height: 52px; border-radius: 50%;
      border: 4px solid var(--border-color, #e2e8f0);
      border-top-color: var(--color-primary, #6C63FF);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .pl-brand { display:flex; align-items:center; gap:8px; }
    .pl-logo  { font-size: 28px; }
    .pl-name  { font-size: 22px; font-weight: 900; color: var(--text-primary, #0f172a); }
    .pl-msg   { font-size: 14px; color: var(--text-muted, #94a3b8); }
  `],
})
export class PageLoadingComponent {
  @Input() message = '';
}
