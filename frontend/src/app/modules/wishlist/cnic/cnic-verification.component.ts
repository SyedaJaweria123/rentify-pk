// src/app/modules/cnic/cnic-verification.component.ts
/**
 * CnicVerificationComponent — Rentify PK
 * Route: /verify-cnic
 * ─────────────────────────────────────────────────────────────────────────────
 * 3-step CNIC (Pakistan 13-digit National ID) verification flow:
 *   Step 1 — Upload : CNIC front, CNIC back, selfie (with live previews)
 *   Step 2 — Review : confirm images before submitting
 *   Step 3 — Verified: status result (pending / approved / rejected)
 *
 * Backend (existing cnic.routes.js):
 *   POST /api/cnic/submit  → marks CNIC submitted for admin review
 *   GET  /api/cnic/status  → { cnicStatus: {status,label,color,reason}, ... }
 *
 * NOTE: The backend `/submit` route does not store images itself — the CNIC
 * number is captured at registration. Images here are previewed client-side
 * and sent with the submit call so the team can review them. Status is then
 * polled from /api/cnic/status which drives the pending/approved/rejected UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';

type CnicStatus = 'not_provided' | 'pending' | 'verified' | 'rejected' | 'idle';

interface UploadSlot {
  file:    File | null;
  preview: string | null;   // data URL for <img>
  error:   string | null;
}

@Component({
  selector:   'app-cnic-verification',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatButtonModule, MatProgressSpinnerModule,
  ],
  template: `
  <div class="cnic-page">
    <div class="cnic-card">

      <!-- Header -->
      <div class="cnic-head">
        <div class="cnic-logo"><span>🔑</span> Rentify</div>
        <h1 class="cnic-title">Identity Verification</h1>
        <p class="cnic-sub">Verify your CNIC to unlock owner features and build trust with renters.</p>
      </div>

      <!-- ── STEP INDICATOR ── -->
      <div class="steps">
        <div class="step" [class.active]="step() >= 1" [class.done]="step() > 1">
          <div class="step-dot">{{ step() > 1 ? '✓' : '1' }}</div>
          <span class="step-label">Upload</span>
        </div>
        <div class="step-bar" [class.fill]="step() > 1"></div>
        <div class="step" [class.active]="step() >= 2" [class.done]="step() > 2">
          <div class="step-dot">{{ step() > 2 ? '✓' : '2' }}</div>
          <span class="step-label">Review</span>
        </div>
        <div class="step-bar" [class.fill]="step() > 2"></div>
        <div class="step" [class.active]="step() >= 3">
          <div class="step-dot">{{ status() === 'verified' ? '✓' : '3' }}</div>
          <span class="step-label">Verified</span>
        </div>
      </div>

      <!-- Loading initial status -->
      <div class="loading-wrap" *ngIf="loadingStatus()">
        <mat-spinner diameter="34"></mat-spinner>
        <p>Checking your verification status…</p>
      </div>

      <ng-container *ngIf="!loadingStatus()">

      <!-- ═══════════ STEP 1: UPLOAD ═══════════ -->
      <div class="step-pane" *ngIf="step() === 1">
        <div class="upload-grid">

          <!-- CNIC Front -->
          <div class="upload-slot" [class.has-img]="front().preview" [class.err]="front().error">
            <label class="slot-label">CNIC Front</label>
            <div class="dropzone" (click)="frontInput.click()">
              <img *ngIf="front().preview" [src]="front().preview" class="slot-preview" alt="CNIC front"/>
              <div *ngIf="!front().preview" class="slot-empty">
                <span class="slot-icon">🪪</span>
                <span class="slot-hint">Tap to upload front side</span>
              </div>
            </div>
            <input #frontInput type="file" accept="image/*" hidden
                   (change)="onFile($event, 'front')"/>
            <span class="slot-err" *ngIf="front().error">{{ front().error }}</span>
            <button *ngIf="front().preview" class="slot-clear" (click)="clear('front')">Remove</button>
          </div>

          <!-- CNIC Back -->
          <div class="upload-slot" [class.has-img]="back().preview" [class.err]="back().error">
            <label class="slot-label">CNIC Back</label>
            <div class="dropzone" (click)="backInput.click()">
              <img *ngIf="back().preview" [src]="back().preview" class="slot-preview" alt="CNIC back"/>
              <div *ngIf="!back().preview" class="slot-empty">
                <span class="slot-icon">🪪</span>
                <span class="slot-hint">Tap to upload back side</span>
              </div>
            </div>
            <input #backInput type="file" accept="image/*" hidden
                   (change)="onFile($event, 'back')"/>
            <span class="slot-err" *ngIf="back().error">{{ back().error }}</span>
            <button *ngIf="back().preview" class="slot-clear" (click)="clear('back')">Remove</button>
          </div>

          <!-- Selfie -->
          <div class="upload-slot" [class.has-img]="selfie().preview" [class.err]="selfie().error">
            <label class="slot-label">Selfie</label>
            <div class="dropzone" (click)="selfieInput.click()">
              <img *ngIf="selfie().preview" [src]="selfie().preview" class="slot-preview" alt="Selfie"/>
              <div *ngIf="!selfie().preview" class="slot-empty">
                <span class="slot-icon">🤳</span>
                <span class="slot-hint">Tap to upload a selfie</span>
              </div>
            </div>
            <input #selfieInput type="file" accept="image/*" hidden
                   (change)="onFile($event, 'selfie')"/>
            <span class="slot-err" *ngIf="selfie().error">{{ selfie().error }}</span>
            <button *ngIf="selfie().preview" class="slot-clear" (click)="clear('selfie')">Remove</button>
          </div>

        </div>

        <div class="tips">
          <p>📌 Make sure all text is clearly readable and corners are visible.</p>
          <p>📌 Accepted: JPG / PNG, under 5 MB each.</p>
        </div>

        <button class="btn-primary" [disabled]="!allUploaded()" (click)="goReview()">
          Continue to Review →
        </button>
      </div>

      <!-- ═══════════ STEP 2: REVIEW ═══════════ -->
      <div class="step-pane" *ngIf="step() === 2">
        <h3 class="pane-title">Review your documents</h3>
        <div class="review-grid">
          <div class="review-item">
            <img [src]="front().preview" alt="CNIC front"/>
            <span>CNIC Front</span>
          </div>
          <div class="review-item">
            <img [src]="back().preview" alt="CNIC back"/>
            <span>CNIC Back</span>
          </div>
          <div class="review-item">
            <img [src]="selfie().preview" alt="Selfie"/>
            <span>Selfie</span>
          </div>
        </div>

        <p class="submit-err" *ngIf="submitError()">{{ submitError() }}</p>

        <div class="btn-row">
          <button class="btn-ghost" (click)="step.set(1)" [disabled]="submitting()">← Back to Edit</button>
          <button class="btn-primary" (click)="submit()" [disabled]="submitting()">
            <span *ngIf="!submitting()">Submit for Verification</span>
            <span *ngIf="submitting()" class="btn-spin"></span>
          </button>
        </div>
      </div>

      <!-- ═══════════ STEP 3: STATUS ═══════════ -->
      <div class="step-pane" *ngIf="step() === 3">

        <!-- PENDING -->
        <div class="result pending" *ngIf="status() === 'pending'">
          <div class="result-icon">⏳</div>
          <h3>Verification Pending</h3>
          <p>Your documents have been submitted. Our team will review them within 24–48 hours.</p>
          <button class="btn-ghost" (click)="refreshStatus()">Refresh Status</button>
        </div>

        <!-- APPROVED -->
        <div class="result approved" *ngIf="status() === 'verified'">
          <div class="badge-verified">Identity Verified ✓</div>
          <div class="result-icon">✅</div>
          <h3>You're Verified!</h3>
          <p>Your CNIC has been approved. You now have full access to owner features.</p>
          <button class="btn-primary" routerLink="/dashboard">Go to Dashboard →</button>
        </div>

        <!-- REJECTED -->
        <div class="result rejected" *ngIf="status() === 'rejected'">
          <div class="result-icon">❌</div>
          <h3>Verification Rejected</h3>
          <div class="reject-reason" *ngIf="rejectReason()">
            <strong>Reason:</strong> {{ rejectReason() }}
          </div>
          <p>Please review the reason above and re-submit with corrected documents.</p>
          <button class="btn-primary" (click)="resubmit()">Re-submit Documents</button>
        </div>

      </div>

      </ng-container>
    </div>
  </div>
  `,
  styles: [`
    :host {
      --green:#00A651; --green-d:#008C44; --green-l:#E8F8EF;
      --text:#1A1D1F; --text-2:#6F767E; --text-m:#9A9FA5;
      --border:#EFEFEF; --surface:#F5F7FA; --red:#FF4D4D; --amber:#FFB31A;
      display:block; background:var(--surface); min-height:100vh;
      font-family:'Inter','Segoe UI',system-ui,sans-serif;
    }
    .cnic-page { max-width:760px; margin:0 auto; padding:40px 20px; }
    .cnic-card {
      background:#fff; border:1px solid var(--border);
      border-radius:18px; padding:32px; box-shadow:0 8px 30px rgba(0,0,0,0.05);
    }

    /* Header */
    .cnic-head { text-align:center; margin-bottom:28px; }
    .cnic-logo { font-size:20px; font-weight:900; color:var(--green); margin-bottom:14px; }
    .cnic-title { font-size:26px; font-weight:900; color:var(--text); }
    .cnic-sub { font-size:14px; color:var(--text-2); margin-top:6px; }

    /* Step indicator */
    .steps { display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:32px; }
    .step { display:flex; flex-direction:column; align-items:center; gap:6px; }
    .step-dot {
      width:40px; height:40px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:15px;
      background:var(--surface); color:var(--text-m); border:2px solid var(--border);
      transition:all .25s;
    }
    .step.active .step-dot { background:var(--green); color:#fff; border-color:var(--green); }
    .step.done .step-dot   { background:var(--green-d); color:#fff; border-color:var(--green-d); }
    .step-label { font-size:12px; font-weight:600; color:var(--text-2); }
    .step.active .step-label { color:var(--green); }
    .step-bar { width:60px; height:3px; background:var(--border); border-radius:2px; transition:background .25s; }
    .step-bar.fill { background:var(--green); }

    /* Loading */
    .loading-wrap { text-align:center; padding:40px; color:var(--text-2); display:flex; flex-direction:column; align-items:center; gap:14px; }

    /* Upload grid */
    .upload-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:18px; }
    .upload-slot { display:flex; flex-direction:column; gap:8px; }
    .slot-label { font-size:13px; font-weight:700; color:var(--text); }
    .dropzone {
      aspect-ratio:1.6; border:2px dashed var(--border); border-radius:12px;
      display:flex; align-items:center; justify-content:center; cursor:pointer;
      overflow:hidden; background:var(--surface); transition:border-color .2s,background .2s;
    }
    .dropzone:hover { border-color:var(--green); background:var(--green-l); }
    .upload-slot.has-img .dropzone { border-style:solid; border-color:var(--green); }
    .upload-slot.err .dropzone { border-color:var(--red); }
    .slot-preview { width:100%; height:100%; object-fit:cover; }
    .slot-empty { display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--text-m); }
    .slot-icon { font-size:30px; }
    .slot-hint { font-size:12px; }
    .slot-err { font-size:12px; color:var(--red); }
    .slot-clear {
      background:none; border:none; color:var(--red); font-size:12px; font-weight:600;
      cursor:pointer; align-self:flex-start; padding:0;
    }
    .slot-clear:hover { text-decoration:underline; }

    .tips { margin:22px 0; background:var(--surface); border-radius:12px; padding:14px 16px; }
    .tips p { font-size:13px; color:var(--text-2); margin:4px 0; }

    /* Buttons */
    .btn-primary {
      width:100%; padding:14px; border-radius:10px; background:var(--green); color:#fff;
      border:none; font-size:15px; font-weight:800; cursor:pointer; min-height:50px;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 4px 16px rgba(0,166,81,.28); transition:background .15s,transform .15s;
    }
    .btn-primary:hover:not(:disabled) { background:var(--green-d); transform:translateY(-1px); }
    .btn-primary:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; }
    .btn-ghost {
      flex:1; padding:13px; border-radius:10px; background:var(--surface);
      border:1.5px solid var(--border); color:var(--text); font-size:14px; font-weight:700; cursor:pointer;
    }
    .btn-ghost:hover { border-color:var(--green); color:var(--green); }
    .btn-row { display:flex; gap:12px; margin-top:24px; }
    .btn-row .btn-primary { flex:2; }
    .btn-spin {
      width:20px; height:20px; border:2.5px solid rgba(255,255,255,.4);
      border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite;
    }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* Review */
    .pane-title { font-size:18px; font-weight:800; margin-bottom:18px; }
    .review-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px; }
    .review-item { display:flex; flex-direction:column; gap:8px; }
    .review-item img { width:100%; aspect-ratio:1.6; object-fit:cover; border-radius:12px; border:1px solid var(--border); }
    .review-item span { font-size:13px; font-weight:600; color:var(--text-2); text-align:center; }
    .submit-err { color:var(--red); font-size:13px; margin-top:16px; text-align:center; }

    /* Result states */
    .result { text-align:center; padding:24px 0; }
    .result-icon { font-size:56px; margin-bottom:12px; }
    .result h3 { font-size:22px; font-weight:900; margin-bottom:8px; }
    .result p { font-size:14px; color:var(--text-2); margin-bottom:22px; line-height:1.5; }
    .result .btn-ghost { display:inline-block; flex:none; padding:11px 24px; }
    .result .btn-primary { display:inline-flex; width:auto; padding:13px 28px; }
    .badge-verified {
      display:inline-block; background:var(--green-l); color:var(--green-d);
      border:1px solid rgba(0,166,81,.3); border-radius:999px;
      padding:8px 20px; font-size:14px; font-weight:800; margin-bottom:14px;
    }
    .reject-reason {
      background:#FFEBEB; border:1px solid #FFD5D5; color:var(--red);
      border-radius:10px; padding:12px 16px; font-size:14px; margin-bottom:16px; text-align:left;
    }

    @media (max-width:520px) {
      .cnic-card { padding:20px; }
      .step-bar { width:32px; }
    }
  `],
})
export class CnicVerificationComponent implements OnInit {
  private api = environment.apiUrl;

  step          = signal(1);
  loadingStatus = signal(true);
  submitting    = signal(false);
  submitError   = signal<string | null>(null);

  status      = signal<CnicStatus>('idle');
  rejectReason = signal<string | null>(null);

  // Upload slots (signals so the template reacts to previews)
  front  = signal<UploadSlot>({ file: null, preview: null, error: null });
  back   = signal<UploadSlot>({ file: null, preview: null, error: null });
  selfie = signal<UploadSlot>({ file: null, preview: null, error: null });

  allUploaded = computed(() =>
    !!this.front().preview && !!this.back().preview && !!this.selfie().preview);

  private readonly MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.refreshStatus(true);
  }

  // ── Check current status from backend ───────────────────────────────────────
  refreshStatus(initial = false): void {
    if (initial) this.loadingStatus.set(true);
    this.http.get<any>(`${this.api}/cnic/status`).subscribe({
      next: (res) => {
        const s = res?.data?.cnicStatus?.status as CnicStatus;
        this.rejectReason.set(res?.data?.rejectReason || res?.data?.cnicStatus?.reason || null);
        if (s === 'verified' || s === 'pending' || s === 'rejected') {
          this.status.set(s);
          this.step.set(3);   // jump straight to status view
        } else {
          this.status.set('idle');
          this.step.set(1);   // not_provided / idle → start upload
        }
        this.loadingStatus.set(false);
      },
      error: () => {
        // No status / not logged in → start fresh at upload
        this.status.set('idle');
        this.step.set(1);
        this.loadingStatus.set(false);
      },
    });
  }

  // ── File picking + validation + preview ─────────────────────────────────────
  onFile(event: Event, which: 'front' | 'back' | 'selfie'): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    // Validate type + size
    if (!file.type.startsWith('image/')) {
      this.setSlot(which, { file: null, preview: null, error: 'Please choose an image file.' });
      return;
    }
    if (file.size > this.MAX_BYTES) {
      this.setSlot(which, { file: null, preview: null, error: 'Image must be under 5 MB.' });
      return;
    }

    // Read preview
    const reader = new FileReader();
    reader.onload = () => {
      this.setSlot(which, { file, preview: reader.result as string, error: null });
    };
    reader.readAsDataURL(file);
  }

  clear(which: 'front' | 'back' | 'selfie'): void {
    this.setSlot(which, { file: null, preview: null, error: null });
  }

  private setSlot(which: 'front' | 'back' | 'selfie', val: UploadSlot): void {
    if (which === 'front')  this.front.set(val);
    if (which === 'back')   this.back.set(val);
    if (which === 'selfie') this.selfie.set(val);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  goReview(): void {
    if (!this.allUploaded()) return;
    this.submitError.set(null);
    this.step.set(2);
  }

  // ── Submit to backend ───────────────────────────────────────────────────────
  submit(): void {
    this.submitting.set(true);
    this.submitError.set(null);

    // Send images as multipart so the review team has them on file.
    const fd = new FormData();
    if (this.front().file)  fd.append('cnicFront', this.front().file as File);
    if (this.back().file)   fd.append('cnicBack',  this.back().file as File);
    if (this.selfie().file) fd.append('selfie',    this.selfie().file as File);

    this.http.post<any>(`${this.api}/cnic/submit`, fd).subscribe({
      next: (res) => {
        this.submitting.set(false);
        // Backend returns status; treat success as pending review
        const s = res?.status?.status || 'pending';
        this.status.set(s === 'verified' ? 'verified' : 'pending');
        this.step.set(3);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err?.error?.message || 'Submission failed. Please try again.');
      },
    });
  }

  // ── Rejected → re-submit (back to upload) ───────────────────────────────────
  resubmit(): void {
    this.status.set('idle');
    this.rejectReason.set(null);
    this.front.set({ file: null, preview: null, error: null });
    this.back.set({ file: null, preview: null, error: null });
    this.selfie.set({ file: null, preview: null, error: null });
    this.step.set(1);
  }
}
