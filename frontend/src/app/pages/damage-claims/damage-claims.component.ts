import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DamageClaimAdminService } from '../../services/damage-claim-admin.service';

@Component({
  selector: 'app-admin-damage-claims',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe, MatProgressSpinnerModule],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Damage Claims</h1>
          <p class="text-sm text-gray-500">Review and resolve damage claims filed by owners.</p>
        </div>
      </div>

      <!-- Status filter -->
      <div class="flex gap-2 mb-4 flex-wrap">
        @for (s of statuses; track s.value) {
          <button (click)="setStatus(s.value)"
            class="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
            [class.bg-rose-700]="status() === s.value" [class.text-white]="status() === s.value"
            [class.border-rose-700]="status() === s.value"
            [class.bg-white]="status() !== s.value" [class.text-gray-600]="status() !== s.value"
            [class.border-gray-200]="status() !== s.value">
            {{ s.label }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (claims().length === 0) {
        <div class="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
          No claims found{{ status() ? ' for this status' : '' }}.
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th class="px-4 py-3 font-medium">Filed</th>
                <th class="px-4 py-3 font-medium">Owner</th>
                <th class="px-4 py-3 font-medium">Renter</th>
                <th class="px-4 py-3 font-medium">Description</th>
                <th class="px-4 py-3 font-medium">Cost</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              @for (c of claims(); track c._id) {
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ c.createdAt | date:'dd MMM, hh:mm a' }}</td>
                  <td class="px-4 py-3 text-gray-800">{{ c.owner?.name || '—' }}</td>
                  <td class="px-4 py-3 text-gray-800">{{ c.renter?.name || '—' }}</td>
                  <td class="px-4 py-3 text-gray-600 max-w-xs truncate">{{ c.description }}</td>
                  <td class="px-4 py-3 font-medium whitespace-nowrap">Rs {{ c.estimatedCost }}</td>
                  <td class="px-4 py-3">
                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full"
                      [class.bg-amber-100]="c.status === 'pending'" [class.text-amber-700]="c.status === 'pending'"
                      [class.bg-blue-100]="c.status === 'accepted'" [class.text-blue-700]="c.status === 'accepted'"
                      [class.bg-orange-100]="c.status === 'disputed'" [class.text-orange-700]="c.status === 'disputed'"
                      [class.bg-green-100]="c.status === 'resolved'" [class.text-green-700]="c.status === 'resolved'"
                      [class.bg-gray-100]="c.status === 'rejected'" [class.text-gray-600]="c.status === 'rejected'">
                      {{ c.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <a [routerLink]="['/damage-claim', c._id]" class="text-rose-700 font-medium hover:underline">View</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        @if (pages() > 1) {
          <div class="flex items-center justify-center gap-3 mt-4">
            <button (click)="prev()" [disabled]="page() <= 1"
              class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">Prev</button>
            <span class="text-sm text-gray-500">Page {{ page() }} of {{ pages() }}</span>
            <button (click)="next()" [disabled]="page() >= pages()"
              class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40">Next</button>
          </div>
        }
      }
    </div>
  `,
})
export class AdminDamageClaimsComponent implements OnInit {
  claims = signal<any[]>([]);
  loading = signal(true);
  status = signal<string>('');
  page = signal(1);
  pages = signal(1);
  limit = 20;

  statuses = [
    { value: '',         label: 'All' },
    { value: 'pending',  label: 'Pending' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'disputed', label: 'Disputed' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  constructor(
    private svc: DamageClaimAdminService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svc.list({ status: this.status(), page: this.page(), limit: this.limit }).subscribe({
      next: (res) => {
        this.claims.set(res?.data || []);
        this.pages.set(res?.pagination?.pages || 1);
        this.loading.set(false);
      },
      error: () => {
        this.claims.set([]);
        this.loading.set(false);
        this.snack.open('Failed to load claims.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  setStatus(s: string): void { this.status.set(s); this.page.set(1); this.load(); }
  prev(): void { if (this.page() > 1) { this.page.update(p => p - 1); this.load(); } }
  next(): void { if (this.page() < this.pages()) { this.page.update(p => p + 1); this.load(); } }
}
