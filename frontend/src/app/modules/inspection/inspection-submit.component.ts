import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InspectionService, InspectionType, PhotoAngle, InspectionPhoto } from './inspection.service';

interface AngleSlot {
  angle: PhotoAngle;
  label: string;
  required: boolean;
  file: File | null;
  preview: string | null;
  uploaded: InspectionPhoto | null;
  uploading: boolean;
}

@Component({
  selector: 'app-inspection-submit',
  standalone: true,
  imports: [CommonModule, FormsModule, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-8 max-w-3xl">
      <h1 class="text-2xl font-bold text-gray-900 mb-1">{{ typeLabel() }} Inspection{{ viewMode() ? ' Report' : '' }}</h1>
      <p class="text-gray-500 text-sm mb-6">
        {{ viewMode() ? 'Submitted condition report with AI analysis.' : 'Capture clear photos of the item from each angle. These are compared by AI to detect any damage.' }}
      </p>

      @if (loadingReport()) {
        <div class="py-16 text-center text-gray-400">Loading…</div>
      }

      <!-- ===== VIEW MODE: existing report (read-only) ===== -->
      @if (!loadingReport() && viewMode()) {
        <div class="mb-6">
          @if (report()?.overallCondition) {
            <span class="inline-block px-3 py-1 rounded-full text-sm font-bold mb-4"
              [class.bg-green-100]="report().overallCondition === 'excellent' || report().overallCondition === 'good'"
              [class.text-green-800]="report().overallCondition === 'excellent' || report().overallCondition === 'good'"
              [class.bg-red-100]="report().overallCondition === 'damaged' || report().overallCondition === 'poor'"
              [class.text-red-800]="report().overallCondition === 'damaged' || report().overallCondition === 'poor'">
              {{ report().overallCondition | titlecase }}
            </span>
          }
          @if (report()?.aiAnalysis?.conditionScore != null) {
            <div class="mb-3">
              <div class="flex justify-between text-sm mb-1"><span class="text-gray-600">Condition</span><b class="text-gray-900">{{ report().aiAnalysis.conditionScore }}%</b></div>
              <div class="h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-green-600 rounded-full" [style.width.%]="report().aiAnalysis.conditionScore"></div></div>
            </div>
          }
          @if (report()?.aiAnalysis?.damageScore) {
            <div class="mb-3">
              <div class="flex justify-between text-sm mb-1"><span class="text-gray-600">Damage</span><b class="text-gray-900">{{ report().aiAnalysis.damageScore }}%</b></div>
              <div class="h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-red-500 rounded-full" [style.width.%]="report().aiAnalysis.damageScore"></div></div>
            </div>
          }
          @if (report()?.aiAnalysis?.detectedIssues?.length) {
            <div class="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p class="text-sm font-semibold text-amber-800 mb-1">⚠ Detected issues</p>
              <ul class="list-disc list-inside text-sm text-amber-700">
                @for (issue of report().aiAnalysis.detectedIssues; track $index) { <li>{{ issueText(issue) }}</li> }
              </ul>
            </div>
          }
          @if (report()?.photos?.length) {
            <p class="text-sm font-medium text-gray-700 mt-5 mb-2">Photos</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              @for (p of report().photos; track p.url) {
                <img [src]="p.url" class="rounded-lg h-32 w-full object-cover border border-gray-200" />
              }
            </div>
          }
          @if (report()?.notes) {
            <div class="mt-4"><p class="text-sm font-medium text-gray-700 mb-1">Notes</p><p class="text-sm text-gray-600">{{ report().notes }}</p></div>
          }
          <button (click)="goBack()" class="mt-6 w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm">← Back</button>
        </div>
      }

      <!-- ===== SUBMIT MODE: capture form ===== -->
      @if (!loadingReport() && !viewMode()) {
      <!-- Angle slots -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        @for (slot of slots(); track slot.angle) {
          <div class="border border-gray-200 rounded-xl p-3 bg-white">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700">{{ slot.label }}</span>
              @if (slot.required) { <span class="text-xs text-rose-600">required</span> }
            </div>

            @if (slot.preview) {
              <div class="relative">
                <img [src]="slot.preview" [alt]="slot.label" class="rounded-lg h-28 w-full object-cover border border-gray-200" />
                @if (slot.uploading) {
                  <div class="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                    <mat-spinner diameter="24"></mat-spinner>
                  </div>
                } @else if (slot.uploaded) {
                  <span class="absolute top-1 right-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">✓</span>
                }
                <button (click)="clearSlot(slot)" type="button"
                  class="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">Change</button>
              </div>
            } @else {
              <label class="flex flex-col items-center justify-center h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-rose-400">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span class="text-xs text-gray-400 mt-1">Add photo</span>
                <input type="file" accept="image/*" class="hidden" (change)="onFile(slot, $event)" />
              </label>
            }
          </div>
        }
      </div>

      <!-- Notes -->
      <div class="mb-5">
        <label class="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea [(ngModel)]="notes" rows="3" maxlength="2000"
          placeholder="Any visible condition details…"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"></textarea>
      </div>

      @if (errorMsg()) {
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{{ errorMsg() }}</div>
      }

      <div class="flex gap-3">
        <button (click)="goBack()" type="button"
          class="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm">Cancel</button>
        <button (click)="submit()" [disabled]="!canSubmit() || submitting()"
          class="flex-1 py-2.5 rounded-lg bg-rose-700 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
          @if (submitting()) { <mat-spinner diameter="18"></mat-spinner> }
          <span>{{ submitting() ? 'Submitting…' : 'Submit Inspection' }}</span>
        </button>
      </div>
      <p class="text-xs text-gray-400 mt-3 text-center">At least one photo (front) is required. AI analysis runs automatically.</p>
      }
    </div>
  `,
})
export class InspectionSubmitComponent implements OnInit {
  type: InspectionType = 'delivery';
  bookingId = '';
  notes = '';
  submitting = signal(false);
  errorMsg = signal<string>('');
  viewMode = signal(false);
  report = signal<any>(null);
  loadingReport = signal(true);

  slots = signal<AngleSlot[]>([
    { angle: 'front',  label: 'Front',  required: true,  file: null, preview: null, uploaded: null, uploading: false },
    { angle: 'back',   label: 'Back',   required: false, file: null, preview: null, uploaded: null, uploading: false },
    { angle: 'left',   label: 'Left',   required: false, file: null, preview: null, uploaded: null, uploading: false },
    { angle: 'right',  label: 'Right',  required: false, file: null, preview: null, uploaded: null, uploading: false },
    { angle: 'top',    label: 'Top',    required: false, file: null, preview: null, uploaded: null, uploading: false },
    { angle: 'detail', label: 'Detail', required: false, file: null, preview: null, uploaded: null, uploading: false },
  ]);

  typeLabel = computed(() => this.type === 'return' ? 'Return' : 'Delivery');
  canSubmit = computed(() => {
    const s = this.slots();
    const front = s.find((x) => x.angle === 'front');
    const anyUploading = s.some((x) => x.uploading);
    return !!front?.uploaded && !anyUploading;
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private inspections: InspectionService,
    private snack: MatSnackBar,
  ) {}

  issueText(i: any): string {
    if (!i) return '';
    if (typeof i === 'string') return i;
    const bits: string[] = [];
    if (i.type) bits.push(String(i.type));
    if (i.severity) bits.push('(' + i.severity + ')');
    if (i.location) bits.push('— ' + i.location);
    let s = bits.join(' ');
    if (i.description) s += (s ? ': ' : '') + i.description;
    return s || 'Issue detected';
  }

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    const t = this.route.snapshot.paramMap.get('type');
    if (t === 'return' || t === 'delivery') this.type = t;
    if (!this.bookingId) { this.router.navigate(['/bookings']); return; }

    // If a report of this type already exists, show it read-only instead of the form.
    const fetch$ = this.type === 'return'
      ? this.inspections.getReturn(this.bookingId)
      : this.inspections.getDelivery(this.bookingId);
    fetch$.subscribe({
      next: (res: any) => {
        const rep = res?.data?.report || res?.data?.inspection || res?.data || null;
        if (rep && rep._id) { this.report.set(rep); this.viewMode.set(true); }
        this.loadingReport.set(false);
      },
      error: () => { this.loadingReport.set(false); },   // no report yet → submit form
    });
  }

  onFile(slot: AngleSlot, event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files && input.files.length ? input.files[0] : null;
    if (!f) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.updateSlot(slot.angle, { file: f, preview: reader.result as string, uploaded: null });
      this.uploadSlot(slot.angle, f);
    };
    reader.readAsDataURL(f);
    input.value = '';
  }

  private uploadSlot(angle: PhotoAngle, file: File): void {
    this.updateSlot(angle, { uploading: true });
    const fd = new FormData();
    fd.append('image', file);
    this.inspections.uploadImage(fd).subscribe({
      next: (res) => {
        const url = res?.data?.url || res?.url;
        const publicId = res?.data?.publicId || res?.publicId;
        this.updateSlot(angle, { uploading: false, uploaded: { url, publicId, angle } });
      },
      error: (err) => {
        this.updateSlot(angle, { uploading: false });
        this.snack.open(err?.error?.message || 'Photo upload failed.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  clearSlot(slot: AngleSlot): void {
    this.updateSlot(slot.angle, { file: null, preview: null, uploaded: null, uploading: false });
  }

  private updateSlot(angle: PhotoAngle, patch: Partial<AngleSlot>): void {
    this.slots.update((arr) => arr.map((s) => s.angle === angle ? { ...s, ...patch } : s));
  }

  submit(): void {
    this.errorMsg.set('');
    if (!this.canSubmit()) { this.errorMsg.set('Please add at least the front photo and wait for uploads to finish.'); return; }
    if (this.submitting()) return;
    this.submitting.set(true);

    const photos: InspectionPhoto[] = this.slots()
      .filter((s) => s.uploaded)
      .map((s) => s.uploaded as InspectionPhoto);

    const obs = this.type === 'return'
      ? this.inspections.submitReturn(this.bookingId, photos, this.notes.trim())
      : this.inspections.submitDelivery(this.bookingId, photos, this.notes.trim());

    obs.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snack.open(`${this.typeLabel()} inspection submitted. AI analysis running.`, 'OK', { duration: 4000 });
        if (this.type === 'return') this.router.navigate(['/inspection/compare', this.bookingId]);
        else this.router.navigate(['/bookings', this.bookingId]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMsg.set(err?.error?.message || 'Failed to submit inspection.');
      },
    });
  }

  goBack(): void { this.router.navigate(['/bookings', this.bookingId]); }
}
