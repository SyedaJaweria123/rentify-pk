import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div class="text-5xl mb-4">{{ icon }}</div>
      <h3 class="text-gray-700 font-semibold text-lg mb-2">{{ title }}</h3>
      <p class="text-gray-400 text-sm max-w-xs">{{ description }}</p>
      <button *ngIf="actionLabel" (click)="action.emit()"
        class="mt-6 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
        {{ actionLabel }}
      </button>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon         = '📭';
  @Input() title        = 'Nothing here yet';
  @Input() description  = '';
  @Input() actionLabel  = '';
  @Output() action      = new EventEmitter<void>();
}
