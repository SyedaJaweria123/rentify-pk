import { Injectable, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id:      string;
  type:    ToastType;
  title:   string;
  message?: string;
  duration: number;
}

// ── Toast Service ─────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);

  show(type: ToastType, title: string, message = '', duration = 4000): void {
    const id = Math.random().toString(36).slice(2);
    this.toasts.update(t => [...t, { id, type, title, message, duration }]);
    setTimeout(() => this.dismiss(id), duration);
  }

  success(title: string, message = ''): void { this.show('success', title, message); }
  error(title: string, message = ''):   void { this.show('error',   title, message); }
  warning(title: string, message = ''): void { this.show('warning', title, message); }
  info(title: string, message = ''):    void { this.show('info',    title, message); }

  dismiss(id: string): void {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }
}

// ── Toast Container Component ─────────────────────────────────────────────────
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-[200] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      <div *ngFor="let toast of toastService.toasts(); trackBy: trackId"
        class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border animate-slide-in"
        [class.bg-green-50]="toast.type === 'success'" [class.border-green-200]="toast.type === 'success'"
        [class.bg-red-50]="toast.type === 'error'"     [class.border-red-200]="toast.type === 'error'"
        [class.bg-yellow-50]="toast.type === 'warning'" [class.border-yellow-200]="toast.type === 'warning'"
        [class.bg-blue-50]="toast.type === 'info'"     [class.border-blue-200]="toast.type === 'info'">

        <!-- Icon -->
        <span class="text-xl flex-shrink-0 mt-0.5">
          {{ toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : toast.type === 'warning' ? '⚠️' : 'ℹ️' }}
        </span>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold"
            [class.text-green-800]="toast.type === 'success'"
            [class.text-red-800]="toast.type === 'error'"
            [class.text-yellow-800]="toast.type === 'warning'"
            [class.text-blue-800]="toast.type === 'info'">
            {{ toast.title }}
          </p>
          <p *ngIf="toast.message" class="text-xs mt-0.5"
            [class.text-green-600]="toast.type === 'success'"
            [class.text-red-600]="toast.type === 'error'"
            [class.text-yellow-600]="toast.type === 'warning'"
            [class.text-blue-600]="toast.type === 'info'">
            {{ toast.message }}
          </p>
        </div>

        <!-- Close -->
        <button (click)="toastService.dismiss(toast.id)"
          class="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 text-lg leading-none">
          ×
        </button>
      </div>
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { opacity: 0; transform: translateX(100%); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .animate-slide-in { animation: slide-in 0.25s ease-out; }
  `]
})
export class ToastContainerComponent {
  constructor(public toastService: ToastService) {}
  trackId(_: number, t: Toast): string { return t.id; }
}
