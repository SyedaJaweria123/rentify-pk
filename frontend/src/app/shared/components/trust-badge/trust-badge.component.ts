import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

type BadgeTier = 'none' | 'Bronze' | 'Silver' | 'Gold';

/**
 * Owner trust badge — compact, recognizable tier marker shown next to an
 * owner's name. Renders nothing for the 'none' tier so unproven owners simply
 * have no badge (rather than a "low trust" stigma).
 *
 *   <app-trust-badge [badge]="owner.trustBadge" [score]="owner.trustScore" />
 *   <app-trust-badge [badge]="'Gold'" size="lg" [showScore]="true" />
 */
@Component({
  selector: 'app-trust-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (tier() !== 'none') {
      <span
        class="trust-badge"
        [class.size-sm]="size === 'sm'"
        [class.size-md]="size === 'md'"
        [class.size-lg]="size === 'lg'"
        [style.--badge-color]="palette().fg"
        [style.--badge-bg]="palette().bg"
        [style.--badge-ring]="palette().ring"
        [attr.title]="title()">
        <!-- Shield + check mark -->
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2.5l7 2.6v5.4c0 4.6-3 8.3-7 9.5-4-1.2-7-4.9-7-9.5V5.1l7-2.6z"
                fill="var(--badge-color)" opacity="0.18"/>
          <path d="M12 2.5l7 2.6v5.4c0 4.6-3 8.3-7 9.5-4-1.2-7-4.9-7-9.5V5.1l7-2.6z"
                stroke="var(--badge-color)" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M8.6 12.2l2.2 2.2 4.6-4.8" stroke="var(--badge-color)"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="trust-badge__label">{{ tier() }} Owner</span>
        @if (showScore && score != null) {
          <span class="trust-badge__score">{{ score }}</span>
        }
      </span>
    }
  `,
  styles: [`
    .trust-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      color: var(--badge-color);
      background: var(--badge-bg);
      border: 1px solid var(--badge-ring);
      border-radius: 999px;
      font-family: 'Sora', 'Poppins', system-ui, sans-serif;
    }
    .trust-badge svg { width: 1.15em; height: 1.15em; flex-shrink: 0; }
    .trust-badge__label { letter-spacing: 0.01em; }
    .trust-badge__score {
      font-weight: 700;
      padding-left: 0.35em;
      margin-left: 0.1em;
      border-left: 1px solid var(--badge-ring);
      opacity: 0.9;
    }
    /* Sizes */
    .size-sm { font-size: 0.7rem;  padding: 0.18em 0.55em; }
    .size-md { font-size: 0.8rem;  padding: 0.28em 0.7em;  }
    .size-lg { font-size: 0.95rem; padding: 0.4em 0.9em;   }
  `],
})
export class TrustBadgeComponent {
  @Input() badge: BadgeTier | string | null = 'none';
  @Input() score: number | null = null;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() showScore = false;

  // Normalize whatever string we receive into a known tier.
  tier = computed<BadgeTier>(() => {
    const b = (this._badge() || 'none') as string;
    return (['Bronze', 'Silver', 'Gold'].includes(b) ? b : 'none') as BadgeTier;
  });

  // Internal signal mirror of the @Input so computed() reacts to changes.
  private _badge = signal<string>('none');
  ngOnChanges(): void { this._badge.set(String(this.badge || 'none')); }

  title = computed(() => {
    const t = this.tier();
    if (t === 'none') return '';
    const s = this.score != null ? ` — trust score ${this.score}/100` : '';
    return `${t} Owner${s}`;
  });

  // Tier-specific palette (metallic-inspired, accessible contrast).
  palette = computed(() => {
    switch (this.tier()) {
      case 'Gold':   return { fg: '#a16207', bg: '#fef9c3', ring: '#fde68a' };
      case 'Silver': return { fg: '#64748b', bg: '#f1f5f9', ring: '#cbd5e1' };
      case 'Bronze': return { fg: '#b45309', bg: '#ffedd5', ring: '#fed7aa' };
      default:       return { fg: '#9ca3af', bg: '#f3f4f6', ring: '#e5e7eb' };
    }
  });
}
