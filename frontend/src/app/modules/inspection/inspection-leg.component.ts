import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InspectionService } from './inspection.service';

/**
 * Single-handover inspection result — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown right after one handover (the notification links straight here), so a
 * user sees the condition check for THAT moment instead of a combined report
 * of the whole journey. Both the owner and the renter get the same link.
 * Route: /inspection/leg/:type/:bookingId
 */
@Component({
  selector: 'app-inspection-leg',
  standalone: true,
  imports: [CommonModule, RouterModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (errorMsg()) {
        <h1 class="text-2xl font-bold text-gray-900 mb-4">Inspection</h1>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-800 text-sm">{{ errorMsg() }}</div>
        <button (click)="goToBooking()" class="mt-4 w-full border border-gray-300 rounded-xl py-3 font-medium text-gray-700 hover:bg-gray-50">
          Back to Booking
        </button>
      } @else {
        <h1 class="text-2xl font-bold text-gray-900 mb-1">{{ d().label }} Inspection</h1>
        <p class="text-gray-500 text-sm mb-6">
          @if (d().isBaseline) {
            Baseline condition recorded at this handover.
          } @else {
            Compared against the {{ d().baseLabel?.toLowerCase() }} condition.
          }
        </p>

        <!-- Verdict -->
        @if (d().isBaseline) {
          <div class="rounded-xl border border-blue-200 bg-blue-50 p-5 mb-6">
            <p class="font-semibold text-blue-800">Condition recorded</p>
            <p class="text-sm text-blue-700">
              These photos are the starting reference. The next handover will be compared against them.
            </p>
          </div>
        } @else if (!d().compared) {
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-5 mb-6">
            <p class="font-semibold text-gray-700">Analysis running</p>
            <p class="text-sm text-gray-600">The photos were captured — the AI comparison will appear shortly.</p>
          </div>
        } @else {
          <div class="rounded-xl border p-5 mb-6 flex items-start gap-3"
            [class.bg-red-50]="d().hasDamage" [class.border-red-200]="d().hasDamage"
            [class.bg-green-50]="!d().hasDamage" [class.border-green-200]="!d().hasDamage">
            <div class="mt-0.5">
              @if (d().hasDamage) {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
              } @else {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              }
            </div>
            <div>
              <p class="font-semibold" [class.text-red-700]="d().hasDamage" [class.text-green-700]="!d().hasDamage">
                {{ d().hasDamage ? 'New damage detected' : 'No new damage' }}
              </p>
              <p class="text-sm" [class.text-red-600]="d().hasDamage" [class.text-green-600]="!d().hasDamage">
                {{ d().hasDamage
                    ? 'Damage appeared since the ' + (d().baseLabel || '').toLowerCase() + ' check.'
                    : 'The item is in the same condition as the ' + (d().baseLabel || '').toLowerCase() + ' check.' }}
              </p>
            </div>
          </div>

          @if (d().hasDamage) {
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="border border-gray-200 rounded-xl p-5 text-center">
                <p class="text-3xl font-bold text-gray-900">{{ d().damageDelta }}</p>
                <p class="text-xs text-gray-500 mt-1">Damage increase (0–100)</p>
              </div>
              <div class="border border-gray-200 rounded-xl p-5 text-center">
                <p class="text-3xl font-bold text-green-800">Rs {{ d().recommendedDeduction }}</p>
                <p class="text-xs text-gray-500 mt-1">Recommended deduction</p>
              </div>
            </div>

            <div class="border border-gray-200 rounded-xl p-5 mb-4">
              <h3 class="font-semibold text-gray-900 mb-2">AI Summary</h3>
              <p class="text-sm text-gray-700 leading-relaxed">{{ d().summary }}</p>
            </div>

            @if (d().responsibleParty) {
              <div class="rounded-xl p-4 mb-4"
                [class.bg-orange-50]="d().responsibleParty === 'rider'"
                [class.bg-red-50]="d().responsibleParty === 'renter'">
                <p class="text-sm font-semibold"
                  [class.text-orange-800]="d().responsibleParty === 'rider'"
                  [class.text-red-800]="d().responsibleParty === 'renter'">
                  The {{ d().responsibleParty }} was holding the item when this damage appeared.
                </p>
              </div>
            }

            @if (d().newIssues?.length) {
              <div class="border border-gray-200 rounded-xl p-5 mb-4">
                <h3 class="font-semibold text-gray-900 mb-3">New Issues ({{ d().newIssues.length }})</h3>
                <div class="space-y-3">
                  @for (issue of d().newIssues; track $index) {
                    <div class="flex gap-2.5">
                      <span class="text-xs font-bold px-2 py-0.5 rounded-full h-fit whitespace-nowrap"
                        [class.bg-red-100]="issue.severity === 'high'"
                        [class.text-red-700]="issue.severity === 'high'"
                        [class.bg-amber-100]="issue.severity === 'medium'"
                        [class.text-amber-700]="issue.severity === 'medium'"
                        [class.bg-gray-100]="issue.severity === 'low'"
                        [class.text-gray-600]="issue.severity === 'low'">
                        {{ issue.severity }}
                      </span>
                      <div>
                        <p class="text-sm font-semibold text-gray-900">{{ issue.type }}</p>
                        @if (issue.location) { <p class="text-xs text-blue-600">{{ issue.location }}</p> }
                        <p class="text-sm text-gray-600">{{ issue.description }}</p>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          } @else {
            <div class="border border-gray-200 rounded-xl p-5 mb-4">
              <h3 class="font-semibold text-gray-900 mb-2">AI Summary</h3>
              <p class="text-sm text-gray-700 leading-relaxed">{{ d().summary || 'No new damage was found across this handover.' }}</p>
            </div>
          }
        }

        <!-- Photos from this handover -->
        @if (d().photos?.length) {
          <div class="border border-gray-200 rounded-xl p-5 mb-4">
            <h3 class="font-semibold text-gray-900 mb-3">Photos at this handover</h3>
            <div class="grid grid-cols-3 gap-2">
              @for (p of d().photos; track $index) {
                <img [src]="p.url" alt="Condition photo" class="w-full h-24 object-cover rounded-lg border border-gray-200">
              }
            </div>
          </div>
        }

        <!-- Actions -->
        <div class="flex gap-3 mt-6">
          <button (click)="goToBooking()" class="flex-1 border border-gray-300 rounded-xl py-3 font-medium text-gray-700 hover:bg-gray-50">
            Back to Booking
          </button>
          <button (click)="goToFullReport()" class="flex-1 border border-gray-300 rounded-xl py-3 font-medium text-gray-700 hover:bg-gray-50">
            Full Journey Report
          </button>
        </div>
        @if (d().hasDamage) {
          <button (click)="fileClaim()" class="w-full mt-3 bg-green-900 text-white rounded-xl py-3 font-semibold hover:bg-green-800">
            File Damage Claim
          </button>
        }
      }
    </div>
  `,
})
export class InspectionLegComponent implements OnInit {
  loading  = signal(true);
  errorMsg = signal('');
  data     = signal<any>(null);

  /** Template alias. */
  d(): any { return this.data() || {}; }

  private bookingId = '';
  private legType   = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private inspections: InspectionService,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    this.legType   = this.route.snapshot.paramMap.get('type') || '';
    if (!this.bookingId || !this.legType) { this.router.navigate(['/bookings']); return; }

    this.inspections.legResult(this.legType, this.bookingId).subscribe({
      next: (res) => { this.data.set(res?.data || null); this.loading.set(false); },
      error: (err) => {
        this.errorMsg.set(err?.error?.message || 'This inspection is not available yet.');
        this.loading.set(false);
      },
    });
  }

  goToBooking(): void { this.router.navigate(['/bookings', this.bookingId]); }
  goToFullReport(): void { this.router.navigate(['/inspection/compare', this.bookingId]); }

  fileClaim(): void {
    const d = this.d();
    this.router.navigate(['/damage-claim/new', this.bookingId], {
      queryParams: {
        fromInspection: '1',
        summary: d.summary || '',
        recommendedDeduction: d.recommendedDeduction || '',
        damageDelta: d.damageDelta || '',
        responsibleParty: d.responsibleParty || '',
      },
    });
  }
}
