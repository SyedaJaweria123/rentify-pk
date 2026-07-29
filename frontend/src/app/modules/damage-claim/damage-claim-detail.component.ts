import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DamageClaimService } from './damage-claim.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-damage-claim-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, MatProgressSpinnerModule],
  template: `
    <div class="container mx-auto px-4 py-8 max-w-2xl">
      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner diameter="44"></mat-spinner></div>
      } @else if (!claim()) {
        <div class="text-center py-16 text-gray-400">Claim not found.</div>
      } @else {
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <!-- Header -->
          <div class="flex items-start justify-between mb-4">
            <div>
              <h1 class="text-xl font-bold text-gray-900">Damage Claim</h1>
              <p class="text-sm text-gray-500">Filed {{ claim().createdAt | date:'dd MMM, hh:mm a' }}</p>
            </div>
            <span class="text-xs font-semibold px-3 py-1 rounded-full"
              [class.bg-amber-100]="claim().status === 'pending'" [class.text-amber-700]="claim().status === 'pending'"
              [class.bg-blue-100]="claim().status === 'accepted'" [class.text-blue-700]="claim().status === 'accepted'"
              [class.bg-orange-100]="claim().status === 'disputed'" [class.text-orange-700]="claim().status === 'disputed'"
              [class.bg-green-100]="claim().status === 'resolved'" [class.text-green-700]="claim().status === 'resolved'"
              [class.bg-gray-100]="claim().status === 'rejected'" [class.text-gray-600]="claim().status === 'rejected'">
              {{ claim().status }}
            </span>
          </div>

          <!-- Process timeline -->
          <div class="flex items-start gap-0 mb-5 px-1">
            <!-- Step 1: Filed -->
            <div class="flex flex-col items-center flex-1">
              <div class="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-bold">1</div>
              <p class="text-xs font-medium text-gray-700 mt-1.5 text-center">Claim Filed</p>
              <p class="text-[11px] text-gray-400 text-center">{{ claim().createdAt | date:'dd MMM' }}</p>
            </div>
            <div class="h-0.5 flex-1 mt-3.5" [class.bg-rose-600]="claim().renterResponse !== 'none' || claim().status !== 'pending'" [class.bg-gray-200]="claim().renterResponse === 'none' && claim().status === 'pending'"></div>

            <!-- Step 2: Renter response -->
            <div class="flex flex-col items-center flex-1">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                [class.bg-rose-600]="claim().renterResponse !== 'none'" [class.bg-gray-300]="claim().renterResponse === 'none'">2</div>
              <p class="text-xs font-medium mt-1.5 text-center" [class.text-gray-700]="claim().renterResponse !== 'none'" [class.text-gray-400]="claim().renterResponse === 'none'">
                {{ claim().renterResponse === 'none' ? 'Renter Response' : (claim().renterResponse === 'accepted' ? 'Renter Accepted' : 'Renter Disputed') }}
              </p>
              <p class="text-[11px] text-gray-400 text-center">{{ claim().renterRespondedAt ? (claim().renterRespondedAt | date:'dd MMM') : 'Pending' }}</p>
            </div>
            <div class="h-0.5 flex-1 mt-3.5" [class.bg-rose-600]="claim().status === 'resolved' || claim().status === 'rejected'" [class.bg-gray-200]="claim().status !== 'resolved' && claim().status !== 'rejected'"></div>

            <!-- Step 3: Admin decision -->
            <div class="flex flex-col items-center flex-1">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                [class.bg-green-600]="claim().status === 'resolved'" [class.bg-gray-500]="claim().status === 'rejected'" [class.bg-gray-300]="claim().status !== 'resolved' && claim().status !== 'rejected'">3</div>
              <p class="text-xs font-medium mt-1.5 text-center" [class.text-gray-700]="claim().status === 'resolved' || claim().status === 'rejected'" [class.text-gray-400]="claim().status !== 'resolved' && claim().status !== 'rejected'">
                {{ claim().status === 'resolved' ? 'Claim Upheld' : (claim().status === 'rejected' ? 'Claim Rejected' : 'Admin Decision') }}
              </p>
              <p class="text-[11px] text-gray-400 text-center">{{ claim().resolvedAt ? (claim().resolvedAt | date:'dd MMM') : 'Pending' }}</p>
            </div>
          </div>

          <!-- Details -->
          <dl class="text-sm space-y-2 mb-4">
            <div><dt class="text-gray-500 mb-0.5">Description</dt><dd class="text-gray-800">{{ claim().description }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Estimated cost</dt><dd class="font-semibold">Rs {{ claim().estimatedCost }}</dd></div>
            @if (claim().resolvedAmount != null && claim().status === 'resolved') {
              <div class="flex justify-between"><dt class="text-gray-500">Deducted</dt><dd class="font-semibold text-green-700">Rs {{ claim().resolvedAmount }}</dd></div>
            }
            @if (claim().renterResponse && claim().renterResponse !== 'none') {
              <div class="flex justify-between"><dt class="text-gray-500">Renter response</dt><dd class="capitalize">{{ claim().renterResponse }}</dd></div>
            }
            @if (claim().renterNote) {
              <div><dt class="text-gray-500 mb-0.5">Renter note</dt><dd class="text-gray-800">{{ claim().renterNote }}</dd></div>
            }
            @if (claim().status === 'resolved' || claim().status === 'rejected') {
              <div><dt class="text-gray-500 mb-0.5">Admin note</dt><dd class="text-gray-800">{{ claim().adminNote || '—' }}</dd></div>
            }
          </dl>

          <!-- Photos -->
          @if (claim().photos?.length) {
            <div class="grid grid-cols-3 gap-2 mb-4">
              @for (ph of claim().photos; track ph.url) {
                <a [href]="ph.url" target="_blank" rel="noopener">
                  <img [src]="ph.url" alt="damage" class="rounded-lg border border-gray-200 h-24 w-full object-cover" />
                </a>
              }
            </div>
          }

          <!-- RENTER actions (pending only) -->
          @if (isRenter() && claim().status === 'pending') {
            <div class="border-t border-gray-100 pt-4 mt-2">
              <p class="text-sm font-medium text-gray-700 mb-2">Do you accept this claim?</p>
              <textarea [(ngModel)]="note" rows="2" placeholder="Optional note…"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"></textarea>
              <div class="flex gap-3">
                <button (click)="respond('accepted')" [disabled]="acting()"
                  class="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-medium text-sm disabled:opacity-50">Accept</button>
                <button (click)="respond('disputed')" [disabled]="acting()"
                  class="flex-1 py-2.5 rounded-lg bg-orange-600 text-white font-medium text-sm disabled:opacity-50">Dispute</button>
              </div>
            </div>
          }

          <!-- ADMIN actions (not resolved/rejected) -->
          @if (isAdmin() && claim().status !== 'resolved' && claim().status !== 'rejected') {
            <div class="border-t border-gray-100 pt-4 mt-2">
              <p class="text-sm font-medium text-gray-700 mb-2">Admin decision</p>
              <label class="block text-xs text-gray-500 mb-1">Amount to deduct (Rs)</label>
              <input type="number" [(ngModel)]="resolveAmount" min="0" [max]="claim().estimatedCost"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2" />
              <textarea [(ngModel)]="note" rows="2" placeholder="Resolution note…"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"></textarea>
              <div class="flex gap-3">
                <button (click)="resolve('resolve')" [disabled]="acting()"
                  class="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-medium text-sm disabled:opacity-50">Uphold &amp; Deduct</button>
                <button (click)="resolve('reject')" [disabled]="acting()"
                  class="flex-1 py-2.5 rounded-lg bg-gray-200 text-gray-700 font-medium text-sm disabled:opacity-50">Reject Claim</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class DamageClaimDetailComponent implements OnInit {
  claim = signal<any | null>(null);
  loading = signal(true);
  acting = signal(false);
  note = '';
  resolveAmount: number | null = null;

  private claimId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private claims: DamageClaimService,
    private auth: AuthService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.claimId = this.route.snapshot.paramMap.get('claimId') || '';
    if (!this.claimId) { this.router.navigate(['/bookings']); return; }
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.claims.getOne(this.claimId).subscribe({
      next: (res) => {
        const c = res?.data || null;
        this.claim.set(c);
        if (c?.estimatedCost != null) this.resolveAmount = c.estimatedCost;
        this.loading.set(false);
      },
      error: () => { this.claim.set(null); this.loading.set(false); },
    });
  }

  private myId(): string { return String((this.auth.currentUser as any)?.id || (this.auth.currentUser as any)?._id || ''); }
  isRenter(): boolean { const c = this.claim(); return !!c && String(c.renter?._id || c.renter) === this.myId(); }
  isAdmin(): boolean { const r = String(this.auth.currentUser?.role || ''); return r === 'admin' || r === 'super_admin' || r === 'manager'; }

  respond(response: 'accepted' | 'disputed'): void {
    if (this.acting()) return;
    this.acting.set(true);
    this.claims.respond(this.claimId, response, this.note.trim()).subscribe({
      next: () => { this.acting.set(false); this.snack.open(`Claim ${response}.`, 'OK', { duration: 3000 }); this.load(); },
      error: (err) => { this.acting.set(false); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  resolve(decision: 'resolve' | 'reject'): void {
    if (this.acting()) return;
    const amount = decision === 'resolve' ? (this.resolveAmount || 0) : 0;
    if (decision === 'resolve' && amount < 1) {
      this.snack.open('Enter an amount to deduct.', 'Dismiss', { duration: 3000 });
      return;
    }
    this.acting.set(true);
    this.claims.resolve(this.claimId, decision, amount, this.note.trim()).subscribe({
      next: () => { this.acting.set(false); this.snack.open(`Claim ${decision}d.`, 'OK', { duration: 3000 }); this.load(); },
      error: (err) => { this.acting.set(false); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }
}
