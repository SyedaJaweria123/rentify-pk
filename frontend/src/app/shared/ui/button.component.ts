import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
export type ButtonSize    = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      (click)="onClick.emit($event)"
      class="inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      [class]="variantClasses + ' ' + sizeClasses + ' ' + (fullWidth ? 'w-full' : '')">

      <!-- Spinner -->
      <svg *ngIf="loading" class="animate-spin" [class.w-3]="size==='sm'" [class.h-3]="size==='sm'"
        [class.w-4]="size==='md'" [class.h-4]="size==='md'"
        [class.w-5]="size==='lg'" [class.h-5]="size==='lg'"
        fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>

      <!-- Icon -->
      <span *ngIf="icon && !loading">{{ icon }}</span>

      <!-- Label -->
      <span>{{ loading ? loadingText : label }}</span>
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  @Input() label       = '';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize       = 'md';
  @Input() disabled    = false;
  @Input() loading     = false;
  @Input() loadingText = 'Loading...';
  @Input() fullWidth   = false;
  @Input() icon        = '';

  @Output() onClick = new EventEmitter<MouseEvent>();

  get variantClasses(): string {
    const map: Record<ButtonVariant, string> = {
      primary:   'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-sm hover:shadow-md',
      secondary: 'bg-white text-gray-700 border-2 border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-300',
      danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost:     'text-gray-600 hover:bg-gray-100 focus:ring-gray-300',
      success:   'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
    };
    return map[this.variant];
  }

  get sizeClasses(): string {
    const map: Record<ButtonSize, string> = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    };
    return map[this.size];
  }
}
