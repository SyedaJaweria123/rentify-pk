import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center gap-0.5">
      @for (star of stars; track star) {
        <button
          type="button"
          (click)="!readonly && onStarClick(star)"
          (mouseenter)="!readonly && onHover(star)"
          (mouseleave)="!readonly && onHoverLeave()"
          [disabled]="readonly"
          class="focus:outline-none transition-transform"
          [class.cursor-default]="readonly"
          [class.cursor-pointer]="!readonly"
          [class.hover:scale-110]="!readonly">
          <svg
            [class]="iconClass"
            viewBox="0 0 20 20"
            fill="currentColor">
            <path
              d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              [class]="getStarFill(star)"
            />
          </svg>
        </button>
      }
    </div>
  `,
})
export class StarRatingComponent {
  @Input() value = 0;
  @Input() readonly = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Output() ratingChange = new EventEmitter<number>();

  hoverValue = 0;
  stars = [1, 2, 3, 4, 5];

  get iconClass(): string {
    const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-7 h-7' };
    return sizes[this.size];
  }

  getStarFill(star: number): string {
    const effective = this.hoverValue || this.value;
    if (star <= effective)  return 'text-amber-400';
    if (star - 0.5 <= effective) return 'text-amber-200';
    return 'text-gray-200';
  }

  onStarClick(star: number): void {
    this.ratingChange.emit(star);
  }

  onHover(star: number): void {
    this.hoverValue = star;
  }

  onHoverLeave(): void {
    this.hoverValue = 0;
  }
}
