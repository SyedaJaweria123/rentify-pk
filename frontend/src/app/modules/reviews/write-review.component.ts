import { Component, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { StarRatingComponent } from '../../shared/components/star-rating.component';

export interface ReviewSubmitData {
  rating: number; comment: string; subRatings?: Record<string, number>;
}

@Component({
  selector: 'app-write-review',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, StarRatingComponent],
  template: `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Overall Rating *</label>
        <app-star-rating [value]="selectedRating()" size="lg" (ratingChange)="selectedRating.set($event)"></app-star-rating>
        <p *ngIf="submitted && !selectedRating()" class="text-red-500 text-xs mt-1">Please select a rating</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div *ngFor="let sub of subRatingFields">
          <label class="text-xs font-medium text-gray-500 block mb-1">{{ sub.label }}</label>
          <app-star-rating [value]="subRatings()[sub.key] || 0" size="sm" (ratingChange)="onSubRating(sub.key, $event)"></app-star-rating>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Your Review *</label>
        <textarea [formControl]="commentCtrl" rows="4"
          class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 outline-none transition text-sm resize-none"
          placeholder="Tell others about your experience..."></textarea>
        <div class="flex justify-between mt-1">
          <p *ngIf="commentCtrl.hasError('minlength') && commentCtrl.touched" class="text-red-500 text-xs">Minimum 10 characters required</p>
          <p class="text-xs text-gray-400 ml-auto">{{ commentCtrl.value?.length || 0 }} / 1000</p>
        </div>
      </div>
      <button type="button" (click)="onSubmit()" [disabled]="submitting()"
        class="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
        <svg *ngIf="submitting()" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        {{ submitting() ? 'Submitting...' : 'Submit Review' }}
      </button>
    </div>`,
})
export class WriteReviewComponent {
  @Output() reviewSubmitted = new EventEmitter<ReviewSubmitData>();
  commentCtrl   = new FormControl('', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]);
  selectedRating = signal(0);
  subRatings     = signal<Record<string, number>>({});
  submitting     = signal(false);
  submitted      = false;
  readonly subRatingFields = [
    { key: 'accuracy', label: 'Accuracy' }, { key: 'communication', label: 'Communication' },
    { key: 'condition', label: 'Condition' }, { key: 'value', label: 'Value' },
  ];
  onSubRating(key: string, val: number): void { this.subRatings.update(r => ({ ...r, [key]: val })); }
  onSubmit(): void {
    this.submitted = true; this.commentCtrl.markAsTouched();
    if (this.commentCtrl.invalid || !this.selectedRating() || this.submitting()) return;
    this.submitting.set(true);
    this.reviewSubmitted.emit({ rating: this.selectedRating(), comment: this.commentCtrl.value as string, subRatings: this.subRatings() });
    setTimeout(() => this.submitting.set(false), 1000);
  }
}
