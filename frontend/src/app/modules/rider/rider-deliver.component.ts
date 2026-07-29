import { Component, OnInit, signal } from '@angular/core';
import { CommonModule }               from '@angular/common';
import { ActivatedRoute, Router }     from '@angular/router';
import { MatProgressSpinnerModule }   from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RiderService, Evidence }     from './rider.service';
import { ApiService }                 from '../../core/services/api.service';
import { SocketService }              from '../../core/services/socket.service';
import { AuthStateService }           from '../../core/services/auth-state.service';

@Component({
  selector  : 'app-rider-deliver',
  standalone: true,
  imports   : [CommonModule, MatProgressSpinnerModule, MatSnackBarModule],
  template  : `
    <div class="container mx-auto px-4 py-8 max-w-lg">

      <button (click)="goBack()"
        class="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-6 text-sm">
        ← Back
      </button>

      <div class="flex items-start justify-between mb-1">
        <h1 class="text-2xl font-bold text-gray-900">Confirm Delivery</h1>
        <div class="flex gap-2">
          <button
            [disabled]="!renterId"
            (click)="startVoiceCall()"
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700
                   text-xs font-semibold disabled:opacity-50">
            📞 Voice
          </button>
          <button
            [disabled]="!renterId"
            (click)="startVideoCall()"
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700
                   text-xs font-semibold disabled:opacity-50">
            📹 Video
          </button>
        </div>
      </div>
      <p class="text-gray-500 text-sm mb-6">
        Location ya time confirm karna ho toh renter ko call karein.
      </p>

      @if (!submitted()) {
        <!-- Evidence photo -->
        <div class="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <p class="text-sm font-medium text-gray-700 mb-3">
            📸 Delivery evidence photo (required)
          </p>
          <p class="text-xs text-gray-400 mb-3">
            Item renter ko dete waqt photo lo — yeh proof hoga delivery ka.
          </p>
          <input type="file" accept="image/*" (change)="onPhoto($event)"
            class="block w-full text-sm text-gray-600
              file:mr-3 file:py-2 file:px-3 file:rounded-lg
              file:border-0 file:bg-rose-50 file:text-rose-700
              file:font-medium cursor-pointer" />

          @if (photoPreview()) {
            <img [src]="photoPreview()" alt="evidence"
              class="mt-4 rounded-xl border border-gray-200 max-h-56 mx-auto block" />
          }
        </div>

        <!-- Confirm button -->
        <button (click)="confirmDelivery()"
          [disabled]="!photo() || submitting()"
          class="w-full px-5 py-3.5 rounded-xl bg-green-600 text-white font-semibold
            text-base disabled:opacity-50 flex items-center justify-center gap-2 transition">
          @if (submitting()) {
            <mat-spinner diameter="20"></mat-spinner>
            <span>Confirming...</span>
          } @else {
            <span>✅ Confirm Delivery</span>
          }
        </button>

        @if (errorMsg()) {
          <p class="mt-3 text-sm text-red-600 text-center">{{ errorMsg() }}</p>
        }
      }

      <!-- Success state -->
      @if (submitted()) {
        <div class="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div class="text-5xl mb-4">🎉</div>
          <h2 class="text-xl font-bold text-green-800 mb-2">Delivery Complete!</h2>
          <p class="text-sm text-green-700 mb-4">
            Delivery confirm ho gayi — aapki earning 24 ghante mein wallet mein add ho jaayegi.
          </p>

          @if (remainingAmount() > 0 && !remainingHandled()) {
            <div class="bg-white border border-amber-200 rounded-xl p-5 mb-4 text-left">
              <p class="text-sm font-semibold text-gray-800 mb-1">
                💵 Remaining balance due: Rs {{ remainingAmount() }}
              </p>
              <p class="text-xs text-gray-500 mb-4">
                Renter se yeh amount collect karein cash mein, ya confirm karein agar wallet se pay ho gaya.
              </p>
              <div class="flex gap-2 mb-2">
                <button (click)="collectRemaining('cash')"
                  [disabled]="collecting()"
                  class="flex-1 px-3 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
                  Cash Collected
                </button>
                <button (click)="collectRemaining('wallet')"
                  [disabled]="collecting()"
                  class="flex-1 px-3 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50">
                  Wallet Pay
                </button>
              </div>
              <button (click)="markRefused()"
                [disabled]="collecting()"
                class="w-full px-3 py-2.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium disabled:opacity-50">
                ⚠️ Customer Refused Payment
              </button>
              @if (remainingErrorMsg()) {
                <p class="mt-2 text-xs text-red-600 text-center">{{ remainingErrorMsg() }}</p>
              }
            </div>
          }

          @if (remainingHandled()) {
            <div class="bg-white border border-gray-200 rounded-xl p-4 mb-4 text-sm text-gray-600">
              {{ remainingRefusedFlag() ? '⚠️ Payment refusal recorded — booking flagged for dispute.' : '✅ Remaining balance recorded.' }}
            </div>
          }

          <button (click)="goHome()"
            class="px-6 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm">
            Dashboard pe Jayen
          </button>
        </div>
      }

      <!-- NOTE: video call modal intentionally NOT rendered here — it lives
           globally in main-layout.component, so calls work no matter which
           page either party is on, and so only ONE modal instance ever
           calls joinRoom() for a given call. -->

    </div>
  `,
})
export class RiderDeliverComponent implements OnInit {

  submitting   = signal(false);
  submitted    = signal(false);
  photo        = signal<File | null>(null);
  photoPreview = signal<string | null>(null);
  errorMsg     = signal('');

  // Remaining-balance collection (Trust-Tiered Payment — COD/wallet at handover)
  remainingAmount      = signal(0);
  remainingHandled      = signal(false);
  remainingRefusedFlag = signal(false);
  collecting           = signal(false);
  remainingErrorMsg    = signal('');

  private assignmentId = '';
  renterId = '';

  constructor(
    private route     : ActivatedRoute,
    private router    : Router,
    private rider      : RiderService,
    private api        : ApiService,
    private snack      : MatSnackBar,
    public  socketSvc  : SocketService,
    private authState  : AuthStateService,
  ) {}

  ngOnInit(): void {
    this.assignmentId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.assignmentId) {
      this.snack.open('Assignment ID missing.', 'OK', { duration: 3000 });
      this.router.navigate(['/rider']);
      return;
    }

    this.rider.getAssignment(this.assignmentId).subscribe({
      next: (res: any) => {
        this.renterId = res?.data?.renter?._id || res?.data?.booking?.renter?._id || '';
        const remaining = Number(res?.data?.booking?.remainingAmount) || 0;
        const alreadyCollected = !!res?.data?.booking?.remainingCollectedAt;
        this.remainingAmount.set(alreadyCollected ? 0 : remaining);
        this.remainingHandled.set(alreadyCollected);
      },
      error: () => { /* renterId stays empty — call buttons disabled */ },
    });
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0] || null;
    this.photo.set(file);
    if (file) {
      const reader   = new FileReader();
      reader.onload  = () => this.photoPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      this.photoPreview.set(null);
    }
  }

  confirmDelivery(): void {
    const file = this.photo();
    if (!file || this.submitting()) return;

    this.submitting.set(true);
    this.errorMsg.set('');

    const fd = new FormData();
    fd.append('image', file);

    this.api.upload<any>('/uploads/image', fd).subscribe({
      next: (up) => {
        const evidence: Evidence[] = [{
          url      : up?.data?.url      || up?.url,
          publicId : up?.data?.publicId || up?.publicId,
        }];

        this.rider.deliver(this.assignmentId, evidence).subscribe({
          next : () => {
            this.submitting.set(false);
            this.submitted.set(true);
          },
          error: (err) => {
            this.submitting.set(false);
            this.errorMsg.set(err?.error?.message || 'Delivery confirm nahi hui — dobara try karein.');
          },
        });
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMsg.set(err?.error?.message || 'Photo upload fail — dobara try karein.');
      },
    });
  }

  // ── Remaining balance collection (cash/wallet) or refusal ────────────────
  collectRemaining(method: 'cash' | 'wallet'): void {
    if (this.collecting()) return;
    this.collecting.set(true);
    this.remainingErrorMsg.set('');

    this.rider.collectRemaining(this.assignmentId, method).subscribe({
      next: () => {
        this.collecting.set(false);
        this.remainingHandled.set(true);
        this.remainingRefusedFlag.set(false);
      },
      error: (err) => {
        this.collecting.set(false);
        this.remainingErrorMsg.set(err?.error?.message || 'Collection record nahi hui — dobara try karein.');
      },
    });
  }

  markRefused(): void {
    if (this.collecting()) return;
    this.collecting.set(true);
    this.remainingErrorMsg.set('');

    this.rider.markRefused(this.assignmentId).subscribe({
      next: () => {
        this.collecting.set(false);
        this.remainingHandled.set(true);
        this.remainingRefusedFlag.set(true);
      },
      error: (err) => {
        this.collecting.set(false);
        this.remainingErrorMsg.set(err?.error?.message || 'Refusal record nahi hui — dobara try karein.');
      },
    });
  }

  // ── Video / Voice Call (ZegoCloud) ──────────────────────────────────────
  startVideoCall(): void { this.startCall('video'); }
  startVoiceCall(): void { this.startCall('voice'); }

  private startCall(callType: 'video' | 'voice'): void {
    if (!this.renterId) return;

    const roomId = 'rentify-delivery-' + this.assignmentId;
    const myName = this.myUserName();

    this.socketSvc.callState.set({
      active    : true,
      incoming  : false,
      roomId,
      callerName: myName,
      callType,
    });

    // No `conversation` link for rider-delivery calls — they're tied to the
    // delivery assignment, not a chat thread.
    this.socketSvc.startCallLog(this.renterId, roomId, callType).subscribe({
      next: (res: any) => {
        const callLogId = res?.data?.callLogId || null;
        this.socketSvc.callState.update(s => s ? { ...s, callLogId } : s);
        this.socketSvc.emitVideoCallInvite({ toUserId: this.renterId, roomId, callerName: myName, callType, callLogId });
      },
      error: () => {
        this.socketSvc.emitVideoCallInvite({ toUserId: this.renterId, roomId, callerName: myName, callType });
      },
    });
  }

  private myUserName(): string {
    const u: any = this.authState.currentUser();
    if (u?.name) return u.name;
    try {
      const raw = localStorage.getItem('ra_user');
      if (raw) { const p = JSON.parse(raw); return p?.name || 'Rider'; }
    } catch {}
    return 'Rider';
  }

  goBack(): void  { this.router.navigate(['/rider']); }
  goHome(): void  { this.router.navigate(['/rider']); }
}
