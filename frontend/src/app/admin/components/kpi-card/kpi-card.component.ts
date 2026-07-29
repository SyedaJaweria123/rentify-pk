// src/app/admin/components/kpi-card/kpi-card.component.ts
/**
 * KPI Card — Rentify PK Admin
 * White card with a soft border and gentle shadow (matches the card
 * language used across the Rider/Owner/Renter dashboards), a
 * variant-colored icon tint, and a sliding shimmer skeleton while loading.
 */
import {
  Component, Input, AfterViewInit, OnChanges, OnDestroy,
  ViewChild, ElementRef, SimpleChanges,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
    <!-- Shimmer skeleton -->
    <div *ngIf="loading" class="kpi-card kpi-skeleton">
      <div class="sk-head">
        <div class="sk-icon"></div>
        <div class="sk-line sk-short"></div>
      </div>
      <div class="sk-line sk-long"></div>
      <div class="sk-line sk-tiny"></div>
    </div>

    <!-- Card -->
    <div *ngIf="!loading" class="kpi-card kpi-{{ color }} animate-fade-in">
      <div class="kpi-head">
        <span class="kpi-icon" [ngSwitch]="icon" aria-hidden="true">
          <svg *ngSwitchCase="'users'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <svg *ngSwitchCase="'revenue'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          <svg *ngSwitchCase="'bookings'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <svg *ngSwitchCase="'listings'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
          <svg *ngSwitchCase="'cnic'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="11" r="2.2"/><path d="M4.5 16.5c.7-1.6 2-2.3 3.5-2.3s2.8.7 3.5 2.3M15 9.5h4M15 13h4"/></svg>
          <svg *ngSwitchCase="'active'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.1 12.7a1 1 0 00.8 1.6h6.2l-1.1 7.7 8.9-10.7a1 1 0 00-.8-1.6h-6.2z"/></svg>
          <svg *ngSwitchCase="'owners'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/></svg>
          <svg *ngSwitchCase="'pending'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/></svg>
          <svg *ngSwitchDefault viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20v-3"/></svg>
        </span>
        <p class="kpi-label">{{ label }}</p>
        <canvas #sparkCanvas class="kpi-spark" *ngIf="spark && spark.length > 1"></canvas>
      </div>

      <p class="kpi-value">
        <span *ngIf="prefix" class="kpi-prefix">{{ prefix }}</span>{{ isNumber ? (value | number:'1.0-0') : value }}<span *ngIf="suffix" class="kpi-suffix">{{ suffix }}</span>
      </p>

      <div class="kpi-trend" *ngIf="trend !== undefined"
        [class.trend-up]="trend > 0" [class.trend-down]="trend < 0" [class.trend-flat]="trend === 0">
        <span class="trend-chip">
          <svg *ngIf="trend > 0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg>
          <svg *ngIf="trend < 0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>
          <svg *ngIf="trend === 0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>
          {{ trend > 0 ? '+' : '' }}{{ trend }}%
        </span>
        <span class="trend-period">vs last month</span>
      </div>
      <!-- Keeps trend-less cards the same height as the rest of the row. -->
      <div class="kpi-trend-spacer" *ngIf="trend === undefined"></div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    /* One brand surface for every card; the variant only shifts the icon tint.
       A rainbow of blue/pink/orange KPIs made nothing stand out. */
    .kpi-card {
      height: 100%; box-sizing: border-box;
      background: #fff;
      border: 1px solid #e8ede8;
      border-radius: 14px;
      padding: 20px 22px;
      display: flex; flex-direction: column;
      box-shadow: 0 1px 2px rgba(16,40,24,.04);
      transition: box-shadow .22s ease, border-color .22s ease, transform .22s ease;
      font-family: 'Open Sans', system-ui, sans-serif;
      position: relative;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      border-color: #d5e3d5;
      box-shadow: 0 8px 24px rgba(16,40,24,.09);
    }

    /* Icon sits inline with the label rather than floating in its own row —
       the old layout left a large dead gap between them. */
    .kpi-head { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
    .kpi-icon {
      width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: #EAF3DE; color: #14532D;
    }
    .kpi-icon svg { width: 17px; height: 17px; }
    .kpi-label {
      font-size: 12.5px; color: #5b6b5f; font-weight: 600; margin: 0;
      letter-spacing: .005em; line-height: 1.3;
    }

    .kpi-value {
      font-size: 30px; font-weight: 800; color: #10281a; line-height: 1;
      letter-spacing: -.035em; margin: 0;
      font-variant-numeric: tabular-nums;   /* digits stay aligned across cards */
    }
    .kpi-prefix { font-size: 16px; font-weight: 700; color: #7a8a7e; margin-right: 3px; }
    .kpi-suffix { font-size: 13px; color: #7a8a7e; font-weight: 600; margin-left: 3px; }

    /* Trend colour follows direction. It used to be hard-coded green, so a
       -100% drop still rendered as if it were good news. */
    .kpi-trend {
      display: flex; align-items: center; gap: 7px;
      margin-top: 13px; padding-top: 13px;
      border-top: 1px solid #f2f5f2;
      font-size: 11.5px;
    }
    .trend-chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 8px; border-radius: 6px; font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .trend-up   .trend-chip { background: #e8f6ec; color: #15803d; }
    .trend-down .trend-chip { background: #fdeaea; color: #b42318; }
    .trend-flat .trend-chip { background: #f1f4f2; color: #667085; }
    .trend-period { color: #98a2b3; font-weight: 500; }

    /* Cards without a trend keep the same height as those with one, so the
       grid stays on a single baseline instead of looking ragged. */
    .kpi-trend-spacer { margin-top: 13px; padding-top: 13px; height: 0; }

    /* Variant tints — same card, different icon colour for scanability. */
    .kpi-green  .kpi-icon { background: #EAF3DE; color: #14532D; }
    .kpi-blue   .kpi-icon { background: #e6efff; color: #1d4ed8; }
    .kpi-purple .kpi-icon { background: #efeaff; color: #6d28d9; }
    .kpi-orange .kpi-icon { background: #fff0e0; color: #c2410c; }
    .kpi-red    .kpi-icon { background: #fdeaea; color: #b42318; }
    .kpi-teal   .kpi-icon { background: #ddf7f1; color: #0f766e; }
    .kpi-indigo .kpi-icon { background: #e8ebfd; color: #4338ca; }
    .kpi-amber  .kpi-icon { background: #fdf3d7; color: #b45309; }

    /* Skeleton */
    .kpi-skeleton { background: #fff; display: flex; flex-direction: column; gap: 12px; }
    .sk-head { display: flex; align-items: center; gap: 11px; }
    .sk-line, .sk-icon { position: relative; overflow: hidden; background: #eef1ee; border-radius: 6px; }
    .sk-line::after, .sk-icon::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent);
      transform: translateX(-100%); animation: shimmer 1.4s infinite;
    }
    .sk-short { width: 60%; height: 11px; }
    .sk-long  { width: 50%; height: 28px; border-radius: 8px; }
    .sk-tiny  { width: 70%; height: 10px; margin-top: auto; }
    .sk-icon  { width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; }
    @keyframes shimmer { 100% { transform: translateX(100%); } }

    .animate-fade-in { animation: fadeIn .4s ease-out both; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    .kpi-spark { width: 58px !important; height: 22px !important; opacity: .8; margin-left: auto; }

    @media (prefers-reduced-motion: reduce) {
      .kpi-card, .animate-fade-in { transition: none; animation: none; }
    }
  `]
})
export class KpiCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() label    = '';
  @Input() value:   string | number = 0;
  @Input() icon     = 'users';
  @Input() color:   'green'|'blue'|'purple'|'orange'|'red'|'teal'|'indigo'|'amber' = 'green';
  @Input() trend?:  number;
  @Input() prefix   = '';
  @Input() suffix   = '';
  @Input() loading  = false;
  @Input() spark?:  number[];

  @ViewChild('sparkCanvas') sparkCanvas?: ElementRef<HTMLCanvasElement>;
  private sparkChart: any = null;

  // Sparkline colours mirror the icon tints so a card reads as one unit.
  private readonly sparkColors: Record<string, string> = {
    green: '#14532D', blue: '#1d4ed8', purple: '#6d28d9', orange: '#c2410c',
    red: '#b91c1c', teal: '#0f766e', indigo: '#4338ca', amber: '#b45309',
  };

  get isNumber(): boolean { return typeof this.value === 'number'; }

  ngAfterViewInit(): void { this.drawSpark(); }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['spark'] || changes['loading']) && this.sparkCanvas) {
      setTimeout(() => this.drawSpark(), 50);
    }
  }

  ngOnDestroy(): void { this.sparkChart?.destroy(); }

  private drawSpark(): void {
    if (!this.sparkCanvas || !this.spark || this.spark.length < 2) return;
    if (typeof (window as any).Chart === 'undefined') return;
    const Chart = (window as any).Chart;
    if (this.sparkChart) this.sparkChart.destroy();
    const color = this.sparkColors[this.color] || '#00C48C';
    this.sparkChart = new Chart(this.sparkCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: this.spark.map((_, i) => i),
        datasets: [{ data: this.spark, borderColor: color, borderWidth: 2,
          pointRadius: 0, tension: 0.4, fill: false }],
      },
      options: {
        responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
  }
}
