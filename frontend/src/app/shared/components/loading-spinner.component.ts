import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex justify-center items-center" [class]="containerClass">
      <div class="rounded-full border-4 border-t-transparent animate-spin"
        [ngClass]="{
          'w-6 h-6 border-2': size === 'sm',
          'w-8 h-8':          size === 'md',
          'w-12 h-12':        size === 'lg',
          'border-indigo-500': color === 'indigo',
          'border-white':      color === 'white',
          'border-gray-400':   color === 'gray'
        }">
      </div>
      <p *ngIf="label" class="ml-3 text-sm text-gray-500">{{ label }}</p>
    </div>
  `,
})
export class LoadingSpinnerComponent {
  @Input() size:           'sm' | 'md' | 'lg' = 'md';
  @Input() color:          'indigo' | 'white' | 'gray' = 'indigo';
  @Input() label:          string = '';
  @Input() containerClass: string = 'py-8';
}
