import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * SkeletonCardComponent — Rentify PK
 * Shimmer loading placeholder for any content grid.
 *
 * Usage:
 *   <app-skeleton-card [count]="6" type="listing"></app-skeleton-card>
 *   <app-skeleton-card [count]="3" type="list"></app-skeleton-card>
 *   <app-skeleton-card [count]="4" type="kpi"></app-skeleton-card>
 *   <app-skeleton-card [count]="1" type="detail"></app-skeleton-card>
 */
@Component({
  selector: 'app-skeleton-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- ── Listing card grid skeleton ── -->
    <ng-container *ngIf="type === 'listing'">
      <div class="skel-listing-grid">
        <div class="skel-listing-card" *ngFor="let i of items">
          <div class="skel-img rentify-shimmer"></div>
          <div class="skel-body">
            <div class="skel-line rentify-shimmer" style="width:45%;height:10px"></div>
            <div class="skel-line rentify-shimmer" style="width:85%;height:14px;margin-top:6px"></div>
            <div class="skel-line rentify-shimmer" style="width:60%;height:11px;margin-top:6px"></div>
            <div class="skel-footer">
              <div class="skel-line rentify-shimmer" style="width:40%;height:18px"></div>
              <div class="skel-line rentify-shimmer" style="width:25%;height:32px;border-radius:8px"></div>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ── Horizontal list skeleton ── -->
    <ng-container *ngIf="type === 'list'">
      <div class="skel-list">
        <div class="skel-list-item" *ngFor="let i of items">
          <div class="skel-avatar rentify-shimmer"></div>
          <div class="skel-list-body">
            <div class="skel-line rentify-shimmer" style="width:55%;height:13px"></div>
            <div class="skel-line rentify-shimmer" style="width:35%;height:11px;margin-top:6px"></div>
          </div>
          <div class="skel-line rentify-shimmer" style="width:60px;height:24px;border-radius:20px"></div>
        </div>
      </div>
    </ng-container>

    <!-- ── KPI card skeleton ── -->
    <ng-container *ngIf="type === 'kpi'">
      <div class="skel-kpi-grid">
        <div class="skel-kpi-card" *ngFor="let i of items">
          <div class="skel-line rentify-shimmer" style="width:40px;height:40px;border-radius:12px"></div>
          <div style="flex:1">
            <div class="skel-line rentify-shimmer" style="width:70%;height:20px"></div>
            <div class="skel-line rentify-shimmer" style="width:45%;height:11px;margin-top:8px"></div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- ── Detail page skeleton ── -->
    <ng-container *ngIf="type === 'detail'">
      <div class="skel-detail">
        <div class="skel-detail-img rentify-shimmer"></div>
        <div class="skel-detail-body">
          <div class="skel-line rentify-shimmer" style="width:30%;height:12px"></div>
          <div class="skel-line rentify-shimmer" style="width:75%;height:24px;margin-top:10px"></div>
          <div class="skel-line rentify-shimmer" style="width:40%;height:20px;margin-top:10px"></div>
          <div class="skel-line rentify-shimmer" style="width:90%;height:12px;margin-top:20px"></div>
          <div class="skel-line rentify-shimmer" style="width:85%;height:12px;margin-top:8px"></div>
          <div class="skel-line rentify-shimmer" style="width:70%;height:12px;margin-top:8px"></div>
        </div>
      </div>
    </ng-container>

    <!-- ── Table row skeleton ── -->
    <ng-container *ngIf="type === 'table'">
      <div class="skel-table-rows">
        <div class="skel-table-row" *ngFor="let i of items">
          <div class="skel-line rentify-shimmer" style="width:36px;height:36px;border-radius:8px;flex-shrink:0"></div>
          <div class="skel-line rentify-shimmer" style="flex:1;height:13px"></div>
          <div class="skel-line rentify-shimmer" style="width:80px;height:13px"></div>
          <div class="skel-line rentify-shimmer" style="width:70px;height:22px;border-radius:20px"></div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    /* shared shimmer animation (also defined globally in styles.css) */
    @keyframes rentify-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    .rentify-shimmer {
      background: linear-gradient(90deg, var(--shimmer-base,#f0f0f0) 25%, var(--shimmer-shine,#e0e0e0) 50%, var(--shimmer-base,#f0f0f0) 75%);
      background-size: 800px 100%;
      animation: rentify-shimmer 1.4s infinite linear;
      border-radius: 6px;
    }

    /* Listing grid */
    .skel-listing-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:20px; }
    .skel-listing-card { background:var(--card-bg,#fff); border:1px solid var(--card-border,#e2e8f0); border-radius:14px; overflow:hidden; }
    .skel-img          { height:160px; border-radius:0; }
    .skel-body         { padding:14px; display:flex; flex-direction:column; gap:8px; }
    .skel-footer       { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
    .skel-line         { display:block; }

    /* List */
    .skel-list      { display:flex; flex-direction:column; gap:10px; }
    .skel-list-item { display:flex; align-items:center; gap:12px; padding:14px; background:var(--card-bg,#fff); border-radius:12px; border:1px solid var(--card-border,#e2e8f0); }
    .skel-avatar    { width:44px; height:44px; border-radius:50%; background:var(--shimmer-base,#f0f0f0); flex-shrink:0; animation:rentify-shimmer 1.4s infinite linear; background-size:800px 100%; }
    .skel-list-body { flex:1; display:flex; flex-direction:column; gap:6px; }

    /* KPI */
    .skel-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
    .skel-kpi-card { background:var(--card-bg,#fff); border:1px solid var(--card-border,#e2e8f0); border-radius:14px; padding:18px; display:flex; gap:12px; align-items:flex-start; }

    /* Detail */
    .skel-detail      { display:grid; grid-template-columns:1fr 1fr; gap:32px; max-width:1000px; }
    .skel-detail-img  { height:320px; border-radius:14px; background:var(--shimmer-base,#f0f0f0); animation:rentify-shimmer 1.4s infinite linear; background-size:800px 100%; }
    .skel-detail-body { display:flex; flex-direction:column; gap:6px; padding-top:8px; }

    /* Table */
    .skel-table-rows { display:flex; flex-direction:column; gap:6px; }
    .skel-table-row  { display:flex; align-items:center; gap:14px; padding:12px 16px; background:var(--card-bg,#fff); border-radius:10px; border:1px solid var(--card-border,#e2e8f0); }

    @media (max-width:768px) {
      .skel-kpi-grid  { grid-template-columns:repeat(2,1fr); }
      .skel-detail    { grid-template-columns:1fr; }
      .skel-listing-grid { grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); }
    }
  `],
})
export class SkeletonCardComponent {
  /** Number of skeleton items to show */
  @Input() count = 6;
  /** Layout type of skeleton */
  @Input() type: 'listing' | 'list' | 'kpi' | 'detail' | 'table' = 'listing';

  get items(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }
}
