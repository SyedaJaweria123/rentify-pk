import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { InspectionService } from './inspection.service';

/**
 * AI Damage Comparison — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Presents the item's condition across every leg of its journey as a vertical
 * timeline. Each leg compares against the previous handover, so new damage is
 * attributed to whoever was actually holding the item — not lumped onto the
 * renter the way a single delivery↔return gap did.
 * Older bookings fall back to that single comparison, which the API still
 * returns, so nothing breaks for pre-existing data.
 */
@Component({
  selector: 'app-inspection-comparison',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cmp-page">
      <div class="cmp-wrap">

        <header class="cmp-head">
          <span class="cmp-eyebrow">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 16v-4M12 8h.01"/></svg>
            AI Condition Report
          </span>
          <h1>Damage Comparison</h1>
          <p>Every handover was photographed and compared automatically.</p>
        </header>

        <div *ngIf="loading()" class="cmp-loading">
          <div class="cmp-spinner" aria-hidden="true"></div>
          <p>Loading condition report…</p>
        </div>

        <div *ngIf="!loading() && errorMsg()" class="cmp-empty">
          <p>{{ errorMsg() }}</p>
          <button (click)="goToBooking()" class="cmp-btn cmp-btn-ghost">Back to Booking</button>
        </div>

        <ng-container *ngIf="!loading() && !errorMsg()">

          <!-- Verdict -->
          <div class="cmp-verdict" [class.is-damaged]="anyDamage()">
            <span class="cmp-verdict-ic" aria-hidden="true">
              <svg *ngIf="anyDamage()" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
              <svg *ngIf="!anyDamage()" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </span>
            <div class="cmp-verdict-body">
              <p class="cmp-verdict-title">{{ anyDamage() ? 'Damage detected' : 'No new damage' }}</p>
              <p class="cmp-verdict-sub">
                <ng-container *ngIf="anyDamage()">Found during {{ blameText() }}.</ng-container>
                <ng-container *ngIf="!anyDamage()">The item came back in comparable condition at every handover.</ng-container>
              </p>
            </div>
            <div class="cmp-verdict-amount" *ngIf="anyDamage()">
              <span class="cmp-amt-val">Rs {{ totalDeduction() }}</span>
              <span class="cmp-amt-lbl">recommended</span>
            </div>
          </div>

          <!-- Journey timeline -->
          <div class="cmp-timeline">
            <div class="cmp-leg" *ngFor="let leg of legs(); let last = last"
              [class.leg-damaged]="leg.status === 'done' && leg.hasDamage"
              [class.leg-clear]="leg.status === 'done' && !leg.hasDamage"
              [class.leg-waiting]="leg.status !== 'done'">

              <!-- Rail -->
              <div class="cmp-rail" aria-hidden="true">
                <span class="cmp-dot">
                  <svg *ngIf="leg.status === 'done' && !leg.hasDamage" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  <svg *ngIf="leg.status === 'done' && leg.hasDamage" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M12 8v5M12 17h.01"/></svg>
                </span>
                <span class="cmp-line" *ngIf="!last"></span>
              </div>

              <!-- Card -->
              <div class="cmp-card">
                <div class="cmp-card-head">
                  <div>
                    <p class="cmp-leg-title">{{ leg.label }}</p>
                    <p class="cmp-leg-sub">{{ leg.sub }}</p>
                  </div>
                  <span class="cmp-badge">{{ statusLabel(leg) }}</span>
                </div>

                <ng-container *ngIf="leg.status === 'done'">
                  <!-- Before / after strip -->
                  <div class="cmp-strip" *ngIf="leg.basePhotos?.length || leg.laterPhotos?.length">
                    <div class="cmp-strip-col">
                      <span class="cmp-strip-lbl">{{ leg.baseLabel }}</span>
                      <div class="cmp-thumbs">
                        <img *ngFor="let p of leg.basePhotos" [src]="p" alt="" loading="lazy">
                        <span *ngIf="!leg.basePhotos?.length" class="cmp-thumb-empty">—</span>
                      </div>
                    </div>
                    <span class="cmp-strip-arrow" aria-hidden="true">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                    </span>
                    <div class="cmp-strip-col">
                      <span class="cmp-strip-lbl">{{ leg.label }}</span>
                      <div class="cmp-thumbs">
                        <img *ngFor="let p of leg.laterPhotos" [src]="p" alt="" loading="lazy">
                        <span *ngIf="!leg.laterPhotos?.length" class="cmp-thumb-empty">—</span>
                      </div>
                    </div>
                  </div>

                  <ng-container *ngIf="leg.hasDamage">
                    <div class="cmp-metrics">
                      <div class="cmp-metric">
                        <span class="cmp-metric-val">{{ leg.damageDelta }}</span>
                        <span class="cmp-metric-lbl">Damage increase</span>
                      </div>
                      <div class="cmp-metric">
                        <span class="cmp-metric-val cmp-metric-money">Rs {{ leg.recommendedDeduction }}</span>
                        <span class="cmp-metric-lbl">Recommended deduction</span>
                      </div>
                    </div>

                    <p class="cmp-summary">{{ leg.summary }}</p>

                    <p class="cmp-blame" [class.blame-rider]="leg.responsibleParty === 'rider'">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      The <strong>{{ leg.responsibleParty }}</strong> was holding the item during this leg
                    </p>

                    <ul class="cmp-issues" *ngIf="leg.newIssues?.length">
                      <li *ngFor="let issue of leg.newIssues">
                        <span class="cmp-sev" [class.sev-high]="issue.severity === 'high'"
                          [class.sev-med]="issue.severity === 'medium'" [class.sev-low]="issue.severity === 'low'">
                          {{ issue.severity }}
                        </span>
                        <span class="cmp-issue-body">
                          <strong>{{ issue.type }}</strong>
                          <em *ngIf="issue.location">{{ issue.location }}</em>
                          <span>{{ issue.description }}</span>
                        </span>
                      </li>
                    </ul>
                  </ng-container>

                  <p class="cmp-clear-note" *ngIf="!leg.hasDamage">
                    {{ leg.summary || 'No new damage found across this handover.' }}
                  </p>
                </ng-container>

                <p class="cmp-waiting-note" *ngIf="leg.status !== 'done'">
                  {{ leg.status === 'pending' ? 'Photos captured — analysis still running.' : 'Waiting for this handover to happen.' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="cmp-actions">
            <button (click)="goToBooking()" class="cmp-btn cmp-btn-ghost">Back to Booking</button>
            <button *ngIf="anyDamage()" (click)="fileClaim()" class="cmp-btn cmp-btn-solid">File Damage Claim</button>
          </div>

        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    /* Brand palette (#1F5435 forest, #EAF3DE mint) rather than the generic
       gray/blue Tailwind defaults this page shipped with. */
    .cmp-page { background: #faf9f6; min-height: 100vh; padding: 36px 20px 64px; }
    .cmp-wrap { max-width: 720px; margin: 0 auto; font-family: 'Poppins','Inter',system-ui,sans-serif; }

    .cmp-head { margin-bottom: 26px; }
    .cmp-eyebrow {
      display: inline-flex; align-items: center; gap: 6px;
      background: #EAF3DE; color: #1F5435; border: 1px solid #d3e6c4;
      font-size: 11.5px; font-weight: 700; letter-spacing: .03em;
      padding: 5px 12px; border-radius: 999px; margin-bottom: 12px;
    }
    .cmp-head h1 { font-family: 'Sora','Poppins',sans-serif; font-size: 27px; font-weight: 800; color: #143524; letter-spacing: -.025em; margin: 0; }
    .cmp-head p  { font-size: 13.5px; color: #6b7280; margin: 5px 0 0; }

    .cmp-loading { text-align: center; padding: 60px 0; color: #6b7280; font-size: 14px; }
    .cmp-spinner {
      width: 34px; height: 34px; margin: 0 auto 14px; border-radius: 50%;
      border: 3px solid #EAF3DE; border-top-color: #1F5435; animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .cmp-empty { background: #fff; border: 1px solid #ecefe9; border-radius: 16px; padding: 32px; text-align: center; color: #6b7280; font-size: 14px; }
    .cmp-empty .cmp-btn { margin-top: 18px; }

    /* Verdict banner */
    .cmp-verdict {
      display: flex; align-items: center; gap: 14px;
      background: #fff; border: 1px solid #d3e6c4; border-left: 4px solid #1F5435;
      border-radius: 14px; padding: 18px 20px; margin-bottom: 26px;
      box-shadow: 0 2px 10px rgba(20,53,36,.05);
    }
    .cmp-verdict.is-damaged { border-color: #f2d4d4; border-left-color: #b42318; }
    .cmp-verdict-ic {
      width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: #EAF3DE; color: #1F5435;
    }
    .cmp-verdict.is-damaged .cmp-verdict-ic { background: #fdeaea; color: #b42318; }
    .cmp-verdict-body { flex: 1; min-width: 0; }
    .cmp-verdict-title { font-size: 15.5px; font-weight: 800; color: #143524; margin: 0; }
    .cmp-verdict.is-damaged .cmp-verdict-title { color: #b42318; }
    .cmp-verdict-sub { font-size: 13px; color: #6b7280; margin: 3px 0 0; line-height: 1.5; }
    .cmp-verdict-amount { text-align: right; flex-shrink: 0; }
    .cmp-amt-val { display: block; font-size: 19px; font-weight: 800; color: #b42318; letter-spacing: -.02em; }
    .cmp-amt-lbl { display: block; font-size: 10.5px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }

    /* Timeline */
    .cmp-timeline { display: flex; flex-direction: column; }
    .cmp-leg { display: flex; gap: 16px; }
    .cmp-rail { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; padding-top: 20px; }
    .cmp-dot {
      width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: #EAF3DE; color: #1F5435; border: 2px solid #fff;
      box-shadow: 0 0 0 1.5px #d3e6c4;
    }
    .leg-damaged .cmp-dot { background: #fdeaea; color: #b42318; box-shadow: 0 0 0 1.5px #f2d4d4; }
    .leg-waiting .cmp-dot { background: #f1f3f1; color: #9ca3af; box-shadow: 0 0 0 1.5px #e5e7eb; }
    .cmp-line { flex: 1; width: 2px; background: #e4ebe1; margin: 6px 0; min-height: 20px; }

    .cmp-card {
      flex: 1; min-width: 0; margin-bottom: 14px;
      background: #fff; border: 1px solid #ecefe9; border-radius: 14px; padding: 18px 20px;
      transition: border-color .2s, box-shadow .2s;
    }
    .cmp-card:hover { box-shadow: 0 4px 16px rgba(20,53,36,.07); }
    .leg-damaged .cmp-card { border-color: #f2d4d4; background: #fffbfb; }
    .leg-waiting .cmp-card { background: #fafafa; }

    .cmp-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .cmp-leg-title { font-size: 14.5px; font-weight: 800; color: #143524; margin: 0; letter-spacing: -.01em; }
    .cmp-leg-sub { font-size: 12px; color: #9ca3af; margin: 2px 0 0; }
    .cmp-badge {
      font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 7px;
      white-space: nowrap; background: #EAF3DE; color: #1F5435;
    }
    .leg-damaged .cmp-badge { background: #fdeaea; color: #b42318; }
    .leg-waiting .cmp-badge { background: #f1f3f1; color: #6b7280; }

    /* Before / after thumbnails */
    .cmp-strip { display: flex; align-items: center; gap: 12px; margin-top: 15px; }
    .cmp-strip-col { flex: 1; min-width: 0; }
    .cmp-strip-lbl {
      display: block; font-size: 10px; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: .05em; margin-bottom: 5px;
    }
    .cmp-thumbs { display: flex; gap: 5px; }
    .cmp-thumbs img {
      width: 52px; height: 52px; object-fit: cover; border-radius: 8px;
      border: 1px solid #e4ebe1; background: #f6f7f6;
    }
    .cmp-thumb-empty {
      width: 52px; height: 52px; border-radius: 8px; border: 1px dashed #e4ebe1;
      display: flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 13px;
    }
    .cmp-strip-arrow { color: #b7c7b0; flex-shrink: 0; margin-top: 14px; }

    .cmp-metrics { display: flex; gap: 26px; margin-top: 16px; }
    .cmp-metric-val { display: block; font-size: 24px; font-weight: 800; color: #143524; letter-spacing: -.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .cmp-metric-money { color: #b42318; }
    .cmp-metric-lbl { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; }

    .cmp-summary { font-size: 13.5px; color: #374151; line-height: 1.6; margin: 14px 0 0; }

    .cmp-blame {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 600; color: #b42318;
      background: #fdeaea; padding: 6px 11px; border-radius: 8px; margin: 12px 0 0;
    }
    .cmp-blame.blame-rider { color: #b45309; background: #fdf3d7; }
    .cmp-blame strong { text-transform: capitalize; }

    .cmp-issues { list-style: none; margin: 14px 0 0; padding: 14px 0 0; border-top: 1px solid #f2f5f2; display: flex; flex-direction: column; gap: 11px; }
    .cmp-issues li { display: flex; gap: 10px; }
    .cmp-sev {
      font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px;
      height: fit-content; white-space: nowrap; text-transform: uppercase; letter-spacing: .03em;
    }
    .sev-high { background: #fdeaea; color: #b42318; }
    .sev-med  { background: #fdf3d7; color: #b45309; }
    .sev-low  { background: #f1f3f1; color: #6b7280; }
    .cmp-issue-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .cmp-issue-body strong { font-size: 13px; font-weight: 700; color: #143524; }
    .cmp-issue-body em { font-size: 11.5px; color: #1F5435; font-style: normal; }
    .cmp-issue-body span { font-size: 12.5px; color: #6b7280; line-height: 1.5; }

    .cmp-clear-note, .cmp-waiting-note { font-size: 13px; color: #6b7280; margin: 13px 0 0; line-height: 1.55; }

    .cmp-actions { display: flex; gap: 11px; margin-top: 22px; }
    .cmp-btn {
      flex: 1; padding: 13px 20px; border-radius: 11px;
      font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer;
      transition: filter .2s, background .2s, transform .2s;
    }
    .cmp-btn-ghost { background: #fff; border: 1px solid #dde4da; color: #374151; }
    .cmp-btn-ghost:hover { background: #f6f8f5; }
    .cmp-btn-solid { background: #1F5435; border: none; color: #fff; box-shadow: 0 6px 18px rgba(31,84,53,.24); }
    .cmp-btn-solid:hover { filter: brightness(1.1); transform: translateY(-1px); }

    @media (max-width: 560px) {
      .cmp-page { padding: 24px 14px 48px; }
      .cmp-verdict { flex-wrap: wrap; }
      .cmp-verdict-amount { text-align: left; width: 100%; padding-left: 54px; }
      .cmp-strip { flex-direction: column; align-items: stretch; gap: 10px; }
      .cmp-strip-arrow { transform: rotate(90deg); align-self: center; margin: 0; }
      .cmp-metrics { gap: 18px; }
      .cmp-actions { flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cmp-spinner { animation: none; }
      .cmp-btn, .cmp-card { transition: none; }
    }
  `],
})
export class InspectionComparisonComponent implements OnInit {
  loading  = signal(true);
  legs     = signal<any[]>([]);
  errorMsg = signal<string>('');
  anyDamage      = signal(false);
  totalDeduction = signal(0);

  /** Names the legs where damage appeared, for the verdict line. */
  blameText = computed(() => {
    const damaged = this.legs().filter(l => l.status === 'done' && l.hasDamage);
    return damaged.map(l => l.label.toLowerCase()).join(' and ');
  });

  private bookingId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private inspections: InspectionService,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (!this.bookingId) { this.router.navigate(['/bookings']); return; }

    this.inspections.allComparisons(this.bookingId).subscribe({
      next: (res) => {
        const d = res?.data || {};
        const legs = d.legs || [];
        this.legs.set(legs);
        this.anyDamage.set(!!d.anyDamage);
        this.totalDeduction.set(d.totalDeduction || 0);
        if (!legs.length) this.errorMsg.set('No inspections have been captured for this booking yet.');
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.message || 'Comparison not available yet.');
        this.loading.set(false);
      },
    });
  }

  statusLabel(leg: any): string {
    if (leg.status !== 'done') return leg.status === 'pending' ? 'Analyzing' : 'Not yet';
    return leg.hasDamage ? `+${leg.damageDelta} damage` : 'Clear';
  }

  goToBooking(): void { this.router.navigate(['/bookings', this.bookingId]); }

  /** Pre-fills the claim from the worst damaged leg so the owner doesn't retype
   *  what the comparison already established. */
  fileClaim(): void {
    const worst = this.legs()
      .filter(l => l.status === 'done' && l.hasDamage)
      .sort((a, b) => (b.damageDelta || 0) - (a.damageDelta || 0))[0];
    this.router.navigate(['/damage-claim/new', this.bookingId], {
      queryParams: {
        fromInspection: '1',
        summary: worst?.summary || '',
        recommendedDeduction: this.totalDeduction() || '',
        damageDelta: worst?.damageDelta || '',
        responsibleParty: worst?.responsibleParty || '',
      },
    });
  }
}
