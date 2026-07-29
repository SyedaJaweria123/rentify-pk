import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DamageClaimService, SourceInspection } from './damage-claim.service';

interface PickedFile { file: File; preview: string; }

@Component({
  selector: 'app-damage-claim-create',
  standalone: true,
  imports: [CommonModule, FormsModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      <h1 class="text-2xl font-bold text-gray-900 mb-1">File a Damage Claim</h1>
      <p class="text-gray-500 text-sm mb-6">Report damage to your item with photo evidence. An admin will review it.</p>

      <!-- AI pre-fill banner: only shown when this claim was opened from the
           delivery↔return comparison page (?fromInspection=1 query param). -->
      @if (sourceInspection()) {
        <div class="bg-[#EAF3E5] border border-[#1F5435]/30 rounded-xl p-4 mb-5 flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F5435" stroke-width="2" class="shrink-0 mt-0.5">
            <path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>
          </svg>
          <div>
            <p class="text-sm font-semibold text-[#1F5435]">Pre-filled from AI inspection comparison</p>
            <p class="text-xs text-[#1F5435]/80 mt-0.5">
              The description and estimated cost below were suggested from the delivery↔return photo comparison.
              Review and adjust before filing — admin will see this AI read alongside your claim either way.
            </p>
          </div>
        </div>
      }

      <div class="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <!-- Description -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">What was damaged? <span class="text-red-500">*</span></label>
          <textarea [(ngModel)]="description" rows="4" maxlength="2000"
            placeholder="Describe the damage clearly (e.g. deep scratch on rear panel, cracked screen…)"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:ring-2 focus:ring-[#1F5435] focus:border-[#1F5435]"></textarea>
          <p class="text-xs text-gray-400 mt-1">{{ description.length }}/2000</p>
        </div>

        <!-- Estimated cost -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Estimated repair / replacement cost (Rs) <span class="text-red-500">*</span></label>
          <input type="number" [(ngModel)]="estimatedCost" min="1" step="1"
            placeholder="e.g. 2500"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1F5435] focus:border-[#1F5435]" />
          <p class="text-xs text-gray-400 mt-1">This may be deducted from the renter's security deposit if upheld.</p>
        </div>

        <!-- Photos -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Photo evidence <span class="text-red-500">*</span> (1–6 images)</label>
          <input type="file" accept="image/*" multiple (change)="onPhotos($event)"
            class="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#EAF3E5] file:text-[#1F5435] file:font-medium" />
          @if (photos().length > 0) {
            <div class="grid grid-cols-3 gap-2 mt-3">
              @for (p of photos(); track p.preview) {
                <div class="relative">
                  <img [src]="p.preview" alt="evidence" class="rounded-lg border border-gray-200 h-24 w-full object-cover" />
                  <button (click)="removePhoto(p)" type="button"
                    class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">×</button>
                </div>
              }
            </div>
          }
        </div>

        <!-- Validation summary -->
        @if (validationError()) {
          <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{{ validationError() }}</div>
        }

        <div class="flex gap-3">
          <button (click)="goBack()" type="button"
            class="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm">Cancel</button>
          <button (click)="submit()" [disabled]="!isValid() || submitting()"
            class="flex-1 py-2.5 rounded-lg bg-[#1F5435] text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            @if (submitting()) { <mat-spinner diameter="18"></mat-spinner> }
            <span>{{ submitting() ? 'Filing…' : 'File Claim' }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DamageClaimCreateComponent implements OnInit {
  bookingId = '';
  description = '';
  estimatedCost: number | null = null;
  photos = signal<PickedFile[]>([]);
  submitting = signal(false);

  // Set when the AI delivery↔return comparison handed off into this form
  // (see InspectionComparisonComponent.fileClaim()). Carried along on submit
  // so admin sees the automated read next to the owner's own description —
  // it never changes what gets validated or saved as the human-entered fields.
  sourceInspection = signal<SourceInspection | null>(null);

  isValid = computed(() =>
    this.description.trim().length >= 5 &&
    !!this.estimatedCost && this.estimatedCost >= 1 &&
    this.photos().length >= 1,
  );
  validationError = signal<string>('');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private claims: DamageClaimService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (!this.bookingId) { this.snack.open('Missing booking.', 'Dismiss', { duration: 4000 }); this.router.navigate(['/bookings']); return; }

    // Optional AI hand-off via query params (set by InspectionComparisonComponent).
    const qp = this.route.snapshot.queryParamMap;
    const fromInspection = qp.get('fromInspection') === '1';
    if (fromInspection) {
      const summary = qp.get('summary') || '';
      const recommendedDeduction = Number(qp.get('recommendedDeduction')) || null;
      const damageDelta = Number(qp.get('damageDelta')) || null;
      const inspectionReport = qp.get('inspectionReportId') || null;

      this.sourceInspection.set({ inspectionReport, damageDelta, recommendedDeduction, summary });

      // Pre-fill — owner can still edit both before submitting.
      if (summary) this.description = summary;
      if (recommendedDeduction) this.estimatedCost = recommendedDeduction;
    }
  }

  onPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    const room = 6 - this.photos().length;
    files.slice(0, room).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => this.photos.update((arr) => [...arr, { file: f, preview: reader.result as string }]);
      reader.readAsDataURL(f);
    });
    input.value = '';
  }

  removePhoto(p: PickedFile): void {
    this.photos.update((arr) => arr.filter((x) => x !== p));
  }

  submit(): void {
    this.validationError.set('');
    if (!this.isValid()) {
      this.validationError.set('Please add a description (min 5 chars), a valid cost, and at least one photo.');
      return;
    }
    if (this.submitting()) return;
    this.submitting.set(true);

    const fd = new FormData();
    fd.append('bookingId', this.bookingId);
    fd.append('description', this.description.trim());
    fd.append('estimatedCost', String(this.estimatedCost));
    this.photos().forEach((p) => fd.append('photos', p.file));
    if (this.sourceInspection()) {
      fd.append('sourceInspection', JSON.stringify(this.sourceInspection()));
    }

    this.claims.create(fd).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.snack.open('Damage claim filed. Awaiting review.', 'OK', { duration: 4000 });
        const id = res?.data?._id;
        this.router.navigate(id ? ['/damage-claim', id] : ['/bookings', this.bookingId]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.validationError.set(err?.error?.message || 'Failed to file claim.');
      },
    });
  }

  goBack(): void { this.router.navigate(['/bookings', this.bookingId]); }
}
