import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export type RiderTier = 'none' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

/**
 * Rider rating badge — exact parallel of TrustBadgeComponent (which is for owners).
 * Takes a riderRating (0–5 float) and maps it to a tier:
 *
 *   < 3.0 (or 0 / unrated) → no badge (unproven riders get no stigma)
 *   3.0 – 3.9              → Bronze 🥉
 *   4.0 – 4.4              → Silver 🥈
 *   4.5 – 4.7              → Gold   🥇
 *   4.8 – 5.0              → Platinum 💎
 *
 * Usage:
 *   <app-rider-badge [rating]="rider.riderRating" />
 *   <app-rider-badge [rating]="4.9" size="lg" [showRating]="true" />
 */
@Component({
  selector: 'app-rider-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (tier() !== 'none') {
      <span
        class="rb"
        [class.size-sm]="size === 'sm'"
        [class.size-md]="size === 'md'"
        [class.size-lg]="size === 'lg'"
        [style.--rb-color]="palette().fg"
        [style.--rb-bg]="palette().bg"
        [style.--rb-ring]="palette().ring"
        [attr.title]="title()">

        <!-- Icon per tier -->
        <span class="rb-icon" aria-hidden="true">{{ icon() }}</span>
        <span class="rb-label">{{ tier() }} Rider</span>

        @if (showRating && rating != null && rating > 0) {
          <span class="rb-score">{{ rating | number:'1.1-1' }}</span>
        }
      </span>
    }
  `,
  styles: [`
    .rb {
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      color: var(--rb-color);
      background: var(--rb-bg);
      border: 1px solid var(--rb-ring);
      border-radius: 999px;
      font-family: 'Sora', 'Poppins', system-ui, sans-serif;
    }
    .rb-icon { font-size: 1.05em; line-height: 1; }
    .rb-label { letter-spacing: 0.01em; }
    .rb-score {
      font-weight: 700;
      padding-left: 0.35em;
      margin-left: 0.1em;
      border-left: 1px solid var(--rb-ring);
      opacity: 0.9;
    }
    .size-sm { font-size: 0.7rem;  padding: 0.18em 0.55em; }
    .size-md { font-size: 0.8rem;  padding: 0.28em 0.7em;  }
    .size-lg { font-size: 0.95rem; padding: 0.4em 0.9em;   }
  `],
})
export class RiderBadgeComponent {
  @Input() rating: number | null = null;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() showRating = false;

  private _rating = signal<number>(0);
  ngOnChanges(): void { this._rating.set(Number(this.rating ?? 0)); }

  tier = computed<RiderTier>(() => {
    const r = this._rating();
    if (r >= 4.8) return 'Platinum';
    if (r >= 4.5) return 'Gold';
    if (r >= 4.0) return 'Silver';
    if (r >= 3.0) return 'Bronze';
    return 'none';
  });

  icon = computed(() => {
    switch (this.tier()) {
      case 'Platinum': return '💎';
      case 'Gold':     return '🥇';
      case 'Silver':   return '🥈';
      case 'Bronze':   return '🥉';
      default:         return '';
    }
  });

  title = computed(() => {
    const t = this.tier();
    if (t === 'none') return '';
    const r = this._rating();
    const rStr = r > 0 ? ` — ${r.toFixed(1)}/5 rating` : '';
    return `${t} Rider${rStr}`;
  });

  palette = computed(() => {
    switch (this.tier()) {
      case 'Platinum': return { fg: '#1e40af', bg: '#eff6ff', ring: '#93c5fd' };
      case 'Gold':     return { fg: '#a16207', bg: '#fef9c3', ring: '#fde68a' };
      case 'Silver':   return { fg: '#64748b', bg: '#f1f5f9', ring: '#cbd5e1' };
      case 'Bronze':   return { fg: '#b45309', bg: '#ffedd5', ring: '#fed7aa' };
      default:         return { fg: '#9ca3af', bg: '#f3f4f6', ring: '#e5e7eb' };
    }
  });
}
