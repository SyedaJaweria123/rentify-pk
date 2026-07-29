import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Card Skeleton -->
    <ng-container *ngIf="type === 'card'">
      <div *ngFor="let i of items" class="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm animate-pulse">
        <div class="h-48 bg-gray-200"></div>
        <div class="p-4 space-y-3">
          <div class="h-4 bg-gray-200 rounded-lg w-3/4"></div>
          <div class="h-3 bg-gray-200 rounded-lg w-1/2"></div>
          <div class="flex justify-between items-center pt-2">
            <div class="h-5 bg-gray-200 rounded-lg w-1/3"></div>
            <div class="h-8 bg-gray-200 rounded-xl w-1/4"></div>
          </div>
        </div>
      </div>
    </ng-container>

    <!-- List Skeleton -->
    <ng-container *ngIf="type === 'list'">
      <div *ngFor="let i of items" class="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 animate-pulse">
        <div class="w-12 h-12 bg-gray-200 rounded-xl flex-shrink-0"></div>
        <div class="flex-1 space-y-2">
          <div class="h-4 bg-gray-200 rounded-lg w-3/4"></div>
          <div class="h-3 bg-gray-200 rounded-lg w-1/2"></div>
        </div>
        <div class="h-6 bg-gray-200 rounded-full w-16"></div>
      </div>
    </ng-container>

    <!-- Text Skeleton -->
    <ng-container *ngIf="type === 'text'">
      <div *ngFor="let i of items" class="space-y-2 animate-pulse">
        <div class="h-4 bg-gray-200 rounded-lg w-full"></div>
        <div class="h-4 bg-gray-200 rounded-lg w-5/6"></div>
        <div class="h-4 bg-gray-200 rounded-lg w-4/6"></div>
      </div>
    </ng-container>

    <!-- Profile Skeleton -->
    <ng-container *ngIf="type === 'profile'">
      <div class="flex items-center gap-4 animate-pulse">
        <div class="w-16 h-16 bg-gray-200 rounded-full flex-shrink-0"></div>
        <div class="space-y-2 flex-1">
          <div class="h-5 bg-gray-200 rounded-lg w-1/3"></div>
          <div class="h-3 bg-gray-200 rounded-lg w-1/2"></div>
        </div>
      </div>
    </ng-container>
  `,
})
export class SkeletonComponent {
  @Input() type:  'card' | 'list' | 'text' | 'profile' = 'card';
  @Input() count = 3;

  get items(): number[] { return Array.from({ length: this.count }, (_, i) => i); }
}
