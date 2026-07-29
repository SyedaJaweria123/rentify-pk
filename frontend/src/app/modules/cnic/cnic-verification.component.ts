// src/app/modules/cnic/cnic-verification.component.ts
/**
 * CnicVerificationComponent — Rentify PK
 * Route: /verify-cnic
 * ─────────────────────────────────────────────────────────────────────────────
 * PREMIUM "checkout-card" style CNIC verification — modelled on the reference
 * payment-checkout animation, re-themed green for Rentify and adapted to CNIC.
 *
 * Layout (split, like the reference):
 *   LEFT  — a live, premium CNIC "card" (dark glass) that updates as you type
 *           and FLIPS front↔back.
 *   RIGHT — identity details form (CNIC auto-format + live /validate), an
 *           optional CNIC-photo + selfie attach (feeds the REAL face-match),
 *           and a big "Verify Identity" CTA.
 *
 * Motion beats (matching the video):
 *   type → card fills live → flip → "Verifying Identity…" glowing card →
 *   success checkmark (green glow)  [or pending / rejected — REAL result]
 *
 * Backend (UNCHANGED — all real, already exists):
 *   POST /api/cnic/validate → instant format + province/gender + duplicate check
 *   POST /api/cnic/submit   → multipart (cnicFront, selfie); Cloudinary upload +
 *                             real faceMatch() + auto-reject < 30%
 *   GET  /api/cnic/status   → verified / pending / rejected + cooldown
 *
 * Images stay OPTIONAL-but-recommended: with them the real face-match runs and
 * can auto-verify/reject; without them the submit still enters admin review
 * (pending). The end screen always reflects the REAL backend response — nothing
 * is faked.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

type CnicStatus = 'not_provided' | 'pending' | 'verified' | 'rejected' | 'idle';
type Phase = 'checking' | 'form' | 'verifying' | 'result';

interface Attach { file: File | null; preview: string | null; }

@Component({
  selector:   'app-cnic-verification',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
  <div class="cnic-page">

    <!-- Brand + step chips (like the reference header) -->
    <div class="topbar">
      <div class="brand">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2 3 7v6c0 5 3.8 8.5 9 9 5.2-.5 9-4 9-9V7l-9-5z"/><path d="m9 12 2 2 4-4"/>
        </svg>
        <span>Rentify <b>VERIFY</b></span>
      </div>
      <div class="chips">
        <span class="chip done"><i class="ci">✓</i> Account</span>
        <span class="chip done"><i class="ci">✓</i> Details</span>
        <span class="chip active"><i class="ci">3</i> Verify Identity</span>
      </div>
    </div>

    <!-- Loading initial status -->
    <div class="loading-wrap" *ngIf="phase() === 'checking'">
      <div class="ring-spin"></div><p>Checking your verification status…</p>
    </div>

    <!-- ═══════════════ FORM (split card + fields) ═══════════════ -->
    <div class="checkout" *ngIf="phase() === 'form'">

      <!-- LEFT: live CNIC card -->
      <div class="card-side">
        <div class="card3d" (click)="flip()">
          <div class="card-inner" [class.flipped]="flipped()">

            <!-- FRONT -->
            <div class="card-face card-front">
              <div class="cf-top">
                <div class="cf-emblem">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 2a10 10 0 1 0 4.9 18.7A8 8 0 1 1 12 4c.34 0 .67.02 1 .06A9.9 9.9 0 0 0 12 2z"/><path d="m16 7 .9 1.9 2.1.3-1.5 1.5.36 2.1L16 11.8l-1.86 1 .36-2.1L13 9.2l2.1-.3z"/></svg>
                </div>
                <span class="cf-country">ISLAMIC REPUBLIC OF PAKISTAN</span>
                <span class="cf-nadra">NADRA</span>
              </div>
              <div class="cf-body">
                <div class="cf-photo">
                  <img *ngIf="frontAttach().preview" [src]="frontAttach().preview" alt="CNIC photo"/>
                  <svg *ngIf="!frontAttach().preview" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
                </div>
                <div class="cf-info">
                  <label>Name</label><div class="cf-val">{{ name() || 'Your Name' }}</div>
                  <label>Father Name</label><div class="cf-val sm">{{ father() || '—' }}</div>
                  <div class="cf-meta">
                    <span><label>Gender</label>{{ gender() || '—' }}</span>
                    <span><label>DOB</label>{{ dob() || '—' }}</span>
                  </div>
                </div>
              </div>
              <div class="cf-number">
                <label>Identity Number</label>
                <div class="cf-num">{{ cnicDisplay() }}</div>
              </div>
              <div class="cf-chip"></div>
            </div>

            <!-- BACK -->
            <div class="card-face card-back">
              <div class="cb-strip"></div>
              <div class="cb-body">
                <div class="cb-row"><label>Province</label><span>{{ province() || '—' }}</span></div>
                <div class="cb-row"><label>Date of Issue</label><span>{{ issue() || '—' }}</span></div>
                <div class="cb-row"><label>Date of Expiry</label><span>{{ expiry() || '—' }}</span></div>
                <div class="cb-sign">Holder's Signature</div>
              </div>
              <div class="cb-foot">Property of the Government of Pakistan • Rentify secured</div>
            </div>

          </div>
        </div>
        <button class="flip-hint" (click)="flip()">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
          Tap card to flip
        </button>
      </div>

      <!-- RIGHT: form -->
      <div class="form-side">
        <h2>Verify your identity</h2>
        <p class="sub">Enter your CNIC details to unlock owner features and build trust with renters.</p>

        <label class="fl">CNIC Number</label>
        <div class="field" [class.ok]="cnicValid()" [class.bad]="cnicMsg() && !cnicValid() && !cnicChecking()">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h6M6 14h4"/><circle cx="17" cy="12" r="2.2"/></svg>
          <input inputmode="numeric" placeholder="_____-_______-_" [value]="cnicNumber()" (input)="onCnic($event)" maxlength="15"/>
          <span class="tick" *ngIf="cnicValid()">✓</span>
          <span class="mini-spin" *ngIf="cnicChecking()"></span>
        </div>
        <span class="hint" [class.ok]="cnicValid()" [class.bad]="!cnicValid() && !cnicChecking()" *ngIf="cnicMsg()">{{ cnicMsg() }}</span>

        <div class="grid2">
          <div>
            <label class="fl">Full Name</label>
            <div class="field"><input placeholder="As on CNIC" [value]="name()" (input)="name.set($any($event.target).value)"/></div>
          </div>
          <div>
            <label class="fl">Father Name</label>
            <div class="field"><input placeholder="As on CNIC" [value]="father()" (input)="father.set($any($event.target).value)"/></div>
          </div>
        </div>

        <label class="fl">Date of Birth</label>
        <div class="field"><input placeholder="DD.MM.YYYY" [value]="dob()" (input)="dob.set($any($event.target).value)"/></div>

        <!-- Face-match attach (feeds REAL /submit) -->
        <label class="fl mt">Face match <span class="opt">— recommended for instant verification</span></label>
        <div class="attach-row">
          <div class="attach" [class.filled]="frontAttach().preview" (click)="frontInput.click()">
            <img *ngIf="frontAttach().preview" [src]="frontAttach().preview" alt="CNIC front"/>
            <ng-container *ngIf="!frontAttach().preview">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h5M6 14h3"/><circle cx="16.5" cy="12" r="2.4"/></svg>
              <span>CNIC Photo</span>
            </ng-container>
            <input #frontInput type="file" accept="image/*" capture="environment" hidden (change)="onAttach($event,'front')"/>
          </div>
          <div class="attach" [class.filled]="selfieAttach().preview" (click)="selfieInput.click()">
            <img *ngIf="selfieAttach().preview" [src]="selfieAttach().preview" alt="Selfie"/>
            <ng-container *ngIf="!selfieAttach().preview">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="9" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
              <span>Selfie</span>
            </ng-container>
            <input #selfieInput type="file" accept="image/*" capture="user" hidden (change)="onAttach($event,'selfie')"/>
          </div>
        </div>

        <div class="summary">
          <span>Verification status</span>
          <b>{{ cnicValid() ? 'Ready to verify' : 'Awaiting CNIC' }}</b>
        </div>

        <p class="submit-err" *ngIf="submitError()">{{ submitError() }}</p>

        <button class="btn-verify" [disabled]="!cnicValid()" (click)="verify()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v6c0 5 3.8 8.5 9 9 5.2-.5 9-4 9-9V7l-9-5z"/><path d="m9 12 2 2 4-4"/></svg>
          Verify Identity
        </button>
        <p class="secured"><span>🔒</span> 256-bit encrypted • Powered by NADRA-grade checks</p>
      </div>
    </div>

    <!-- ═══════════════ VERIFYING (glowing card + rings) ═══════════════ -->
    <div class="verifying" *ngIf="phase() === 'verifying'">
      <div class="v-card-wrap">
        <div class="v-rings"><span></span><span></span><span></span></div>
        <div class="v-card">
          <div class="cf-top"><span class="cf-country sm">PAKISTAN • IDENTITY</span></div>
          <div class="v-num">{{ cnicDisplay() }}</div>
          <div class="v-name">{{ name() || 'Verifying…' }}</div>
          <div class="cf-chip"></div>
        </div>
      </div>
      <div class="prog-ring">
        <svg viewBox="0 0 120 120"><circle class="pr-track" cx="60" cy="60" r="52"/><circle class="pr-fill" cx="60" cy="60" r="52" [style.stroke-dashoffset]="327 - (327 * progress() / 100)"/></svg>
        <div class="pr-num">{{ progress() }}<small>%</small></div>
      </div>
      <p class="v-text">{{ verifyText() }}</p>
    </div>

    <!-- ═══════════════ RESULT ═══════════════ -->
    <div class="result-wrap" *ngIf="phase() === 'result'">

      <!-- VERIFIED -->
      <div class="result verified" *ngIf="status() === 'verified'">
        <div class="check-wrap glow-green">
          <svg class="check-svg" viewBox="0 0 80 80"><circle class="ck-circle" cx="40" cy="40" r="36"/><path class="ck-tick" d="M24 41 l11 11 l21 -25"/></svg>
        </div>
        <div class="badge">Identity Verified ✓</div>
        <h2>You’re Verified!</h2>
        <p>Your CNIC has been verified successfully. You now have full access to owner features.</p>
        <button class="btn-verify" routerLink="/dashboard">Go to Dashboard →</button>
      </div>

      <!-- PENDING -->
      <div class="result pending" *ngIf="status() === 'pending'">
        <div class="pend-icon">⏳</div>
        <h2>Submitted for Verification</h2>
        <p>Your details were received{{ hasImages() ? ' and matched' : '' }}. Our team will finish the review within 24–48 hours.</p>
        <button class="btn-ghost" (click)="refreshStatus()">Refresh Status</button>
      </div>

      <!-- REJECTED -->
      <div class="result rejected" *ngIf="status() === 'rejected'">
        <div class="rej-icon">✕</div>
        <h2>Verification Rejected</h2>
        <div class="reject-reason" *ngIf="rejectReason()"><strong>Reason:</strong> {{ rejectReason() }}</div>
        <p *ngIf="!inCooldown()">Please review the reason above and re-submit with corrected details.</p>
        <p *ngIf="inCooldown()" class="cooldown">Too many failed attempts — try again in about {{ cooldownHoursLeft() }} hour{{ cooldownHoursLeft() === 1 ? '' : 's' }}.</p>
        <button class="btn-verify" (click)="resubmit()" [disabled]="inCooldown()">Try Again</button>
      </div>
    </div>

  </div>
  `,
  styles: [`
    :host {
      --green:#00A651; --green-d:#008C44; --green-l:#E8F8EF;
      --card1:#143524; --card2:#0c1f16; --gold:#E8A33D;
      --text:#1A1D1F; --text-2:#6F767E; --text-m:#9A9FA5;
      --border:#EAECEA; --surface:#f4f6f4; --red:#FF4D4D;
      display:block; background:var(--surface); min-height:100vh;
      font-family:'Inter','Segoe UI',system-ui,sans-serif;
    }
    .cnic-page { max-width:1040px; margin:0 auto; padding:26px 20px 60px; }

    /* Topbar */
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; background:#fff; border:1px solid var(--border); border-radius:16px; padding:14px 20px; margin-bottom:22px; flex-wrap:wrap; }
    .brand { display:flex; align-items:center; gap:8px; font-size:16px; font-weight:800; color:var(--green); }
    .brand b { color:var(--text); font-weight:900; letter-spacing:1px; }
    .chips { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .chip { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:var(--text-m); }
    .chip .ci { width:20px; height:20px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; background:var(--surface); border:1.5px solid var(--border); color:var(--text-m); }
    .chip.done { color:var(--green-d); }
    .chip.done .ci { background:var(--green); border-color:var(--green); color:#fff; }
    .chip.active { color:var(--text); }
    .chip.active .ci { background:var(--green); border-color:var(--green); color:#fff; box-shadow:0 0 0 4px rgba(0,166,81,.15); }

    .loading-wrap { text-align:center; padding:70px 0; color:var(--text-2); display:flex; flex-direction:column; align-items:center; gap:14px; }
    .ring-spin { width:38px; height:38px; border:3px solid rgba(0,166,81,.18); border-top-color:var(--green); border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* ── Checkout split ── */
    .checkout { display:grid; grid-template-columns:1fr 1fr; gap:26px; background:#fff; border:1px solid var(--border); border-radius:22px; padding:30px; box-shadow:0 12px 40px rgba(0,0,0,.05); animation:fadeUp .5s cubic-bezier(.16,1,.3,1) both; }
    @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }

    /* ── CNIC CARD (3D flip) ── */
    .card-side { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; }
    .card3d { width:100%; max-width:360px; aspect-ratio:1.585; perspective:1400px; cursor:pointer; }
    .card-inner { position:relative; width:100%; height:100%; transform-style:preserve-3d; transition:transform .8s cubic-bezier(.4,.2,.2,1); animation:cardIn .7s cubic-bezier(.16,1,.3,1) both; }
    .card-inner.flipped { transform:rotateY(180deg); }
    @keyframes cardIn { from { opacity:0; transform:translateY(18px) rotateX(12deg) scale(.94); } to { opacity:1; transform:none; } }
    .card-face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius:18px; overflow:hidden; color:#eaf3ec; box-shadow:0 20px 44px rgba(12,31,22,.4); background:linear-gradient(145deg,var(--card1) 0%,var(--card2) 100%); }
    .card-face::before { content:''; position:absolute; inset:0; background:radial-gradient(150px 90px at 82% 8%, rgba(0,166,81,.35), transparent 70%); }
    .card-face::after { content:''; position:absolute; inset:0; background:linear-gradient(120deg, transparent 40%, rgba(255,255,255,.06) 50%, transparent 60%); }

    .card-front { padding:15px 17px; display:flex; flex-direction:column; }
    .cf-top { display:flex; align-items:center; gap:7px; position:relative; z-index:1; }
    .cf-emblem { color:var(--green); }
    .cf-country { font-size:8px; font-weight:800; letter-spacing:.6px; color:#bcd9c6; }
    .cf-nadra { margin-left:auto; font-size:9px; font-weight:900; letter-spacing:1.5px; color:var(--gold); }
    .cf-body { display:flex; gap:12px; margin-top:12px; position:relative; z-index:1; }
    .cf-photo { width:58px; height:70px; border-radius:8px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; color:#9fc6ae; overflow:hidden; flex:none; }
    .cf-photo img { width:100%; height:100%; object-fit:cover; }
    .cf-info { flex:1; min-width:0; }
    .cf-info label, .cf-number label { display:block; font-size:7.5px; font-weight:700; letter-spacing:.5px; color:#84a992; text-transform:uppercase; margin-bottom:1px; }
    .cf-val { font-size:13px; font-weight:800; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:6px; }
    .cf-val.sm { font-size:11px; font-weight:600; color:#d5e6db; }
    .cf-meta { display:flex; gap:16px; margin-top:2px; }
    .cf-meta span { font-size:11px; font-weight:700; color:#eaf3ec; }
    .cf-number { margin-top:auto; position:relative; z-index:1; }
    .cf-num { font-family:'Courier New',monospace; font-size:16px; font-weight:800; letter-spacing:1.5px; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,.4); }
    .cf-chip { position:absolute; right:17px; bottom:16px; width:34px; height:26px; border-radius:6px; background:linear-gradient(135deg,#f4d27a,var(--gold)); box-shadow:inset 0 0 0 1px rgba(0,0,0,.15); }
    .cf-chip::after { content:''; position:absolute; inset:5px; border:1px solid rgba(0,0,0,.2); border-radius:3px; }

    .card-back { transform:rotateY(180deg); padding:0; display:flex; flex-direction:column; }
    .cb-strip { height:34px; background:linear-gradient(90deg,#0a1811,#123021); margin-top:14px; }
    .cb-body { padding:12px 17px; flex:1; position:relative; z-index:1; }
    .cb-row { display:flex; justify-content:space-between; font-size:10.5px; padding:5px 0; border-bottom:1px dashed rgba(255,255,255,.1); }
    .cb-row label { color:#84a992; font-weight:700; text-transform:uppercase; letter-spacing:.4px; font-size:8.5px; }
    .cb-row span { color:#fff; font-weight:700; }
    .cb-sign { margin-top:12px; height:26px; border-radius:5px; background:repeating-linear-gradient(45deg,rgba(255,255,255,.08),rgba(255,255,255,.08) 6px,transparent 6px,transparent 12px); display:flex; align-items:center; justify-content:center; font-size:8px; color:#9fc6ae; font-style:italic; }
    .cb-foot { padding:8px 17px; font-size:7.5px; color:#6f9480; letter-spacing:.3px; position:relative; z-index:1; }

    .flip-hint { display:inline-flex; align-items:center; gap:6px; background:none; border:none; color:var(--text-2); font-size:12px; font-weight:600; cursor:pointer; }
    .flip-hint:hover { color:var(--green); }

    /* ── FORM ── */
    .form-side h2 { font-size:22px; font-weight:900; color:var(--text); }
    .form-side .sub { font-size:13px; color:var(--text-2); margin:5px 0 18px; line-height:1.5; }
    .fl { display:block; font-size:12px; font-weight:700; color:var(--text); margin:0 0 6px; }
    .fl.mt { margin-top:16px; }
    .fl .opt { font-weight:500; color:var(--text-m); }
    .field { display:flex; align-items:center; gap:9px; border:1.5px solid var(--border); border-radius:11px; padding:0 13px; background:#fff; transition:border-color .2s,box-shadow .2s; margin-bottom:4px; color:var(--text-m); }
    .field:focus-within { border-color:var(--green); box-shadow:0 0 0 4px rgba(0,166,81,.1); color:var(--green); }
    .field.ok { border-color:var(--green); }
    .field.bad { border-color:var(--red); }
    .field input { flex:1; border:none; outline:none; padding:13px 0; font-size:15px; font-weight:600; color:var(--text); background:transparent; letter-spacing:.3px; }
    .field .tick { color:var(--green); font-weight:900; }
    .mini-spin { width:15px; height:15px; border:2px solid rgba(0,166,81,.25); border-top-color:var(--green); border-radius:50%; animation:spin .7s linear infinite; }
    .hint { font-size:11.5px; display:block; margin-bottom:6px; }
    .hint.ok { color:var(--green-d); } .hint.bad { color:var(--red); }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }

    .attach-row { display:flex; gap:12px; }
    .attach { flex:1; aspect-ratio:1.5; border:1.5px dashed var(--border); border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; cursor:pointer; color:var(--text-m); background:var(--surface); overflow:hidden; transition:border-color .2s,background .2s; }
    .attach:hover { border-color:var(--green); background:var(--green-l); color:var(--green); }
    .attach.filled { border-style:solid; border-color:var(--green); }
    .attach img { width:100%; height:100%; object-fit:cover; }
    .attach span { font-size:11.5px; font-weight:700; }

    .summary { display:flex; align-items:center; justify-content:space-between; background:var(--surface); border-radius:12px; padding:13px 16px; margin:18px 0 14px; }
    .summary span { font-size:13px; color:var(--text-2); font-weight:600; }
    .summary b { font-size:14px; color:var(--green-d); font-weight:800; }
    .submit-err { color:var(--red); font-size:13px; margin-bottom:12px; }

    .btn-verify { width:100%; padding:15px; border-radius:12px; background:linear-gradient(135deg,var(--green),var(--green-d)); color:#fff; border:none; font-size:15px; font-weight:800; cursor:pointer; min-height:52px; display:inline-flex; align-items:center; justify-content:center; gap:9px; box-shadow:0 8px 22px rgba(0,166,81,.32); transition:transform .15s,box-shadow .15s; }
    .btn-verify:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 12px 28px rgba(0,166,81,.4); }
    .btn-verify:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; }
    .btn-ghost { padding:12px 22px; border-radius:11px; background:var(--surface); border:1.5px solid var(--border); color:var(--text); font-size:14px; font-weight:700; cursor:pointer; }
    .btn-ghost:hover { border-color:var(--green); color:var(--green); }
    .secured { text-align:center; font-size:11.5px; color:var(--text-m); margin-top:12px; }

    /* ── VERIFYING ── */
    .verifying { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; padding:50px 0; background:#fff; border:1px solid var(--border); border-radius:22px; box-shadow:0 12px 40px rgba(0,0,0,.05); animation:fadeUp .4s ease both; }
    .v-card-wrap { position:relative; width:300px; height:190px; display:flex; align-items:center; justify-content:center; }
    .v-card { width:280px; height:176px; border-radius:16px; background:linear-gradient(145deg,var(--card1),var(--card2)); color:#eaf3ec; padding:16px; box-shadow:0 18px 40px rgba(12,31,22,.4); position:relative; z-index:2; animation:vfloat 2.4s ease-in-out infinite; }
    @keyframes vfloat { 0%,100%{ transform:translateY(0) rotate(-1deg); } 50%{ transform:translateY(-8px) rotate(1deg); } }
    .v-card .cf-country.sm { font-size:8px; color:#bcd9c6; }
    .v-num { font-family:'Courier New',monospace; font-size:17px; font-weight:800; letter-spacing:1.5px; margin-top:40px; }
    .v-name { font-size:13px; font-weight:700; margin-top:8px; color:#d5e6db; }
    .v-rings { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
    .v-rings span { position:absolute; width:220px; height:220px; border:2px solid rgba(0,166,81,.5); border-radius:20px; animation:ring 2.2s ease-out infinite; }
    .v-rings span:nth-child(2){ animation-delay:.7s; } .v-rings span:nth-child(3){ animation-delay:1.4s; }
    @keyframes ring { 0%{ transform:scale(.7); opacity:.8; } 100%{ transform:scale(1.35); opacity:0; } }
    .prog-ring { position:relative; width:120px; height:120px; }
    .prog-ring svg { width:120px; height:120px; }
    .pr-track { fill:none; stroke:var(--surface); stroke-width:9; }
    .pr-fill { fill:none; stroke:var(--green); stroke-width:9; stroke-linecap:round; stroke-dasharray:327; transform:rotate(-90deg); transform-origin:center; transition:stroke-dashoffset .35s ease; }
    .pr-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:900; color:var(--text); }
    .pr-num small { font-size:13px; color:var(--text-2); margin-left:1px; }
    .v-text { font-size:15px; font-weight:700; color:var(--text); }

    /* ── RESULT ── */
    .result-wrap { background:#fff; border:1px solid var(--border); border-radius:22px; padding:44px 30px; box-shadow:0 12px 40px rgba(0,0,0,.05); animation:fadeUp .4s ease both; }
    .result { text-align:center; max-width:440px; margin:0 auto; }
    .result h2 { font-size:24px; font-weight:900; color:var(--text); margin-bottom:8px; }
    .result p { font-size:14px; color:var(--text-2); line-height:1.55; margin-bottom:22px; }
    .check-wrap { width:104px; height:104px; margin:0 auto 18px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--green-l); }
    .check-wrap.glow-green { animation:ckGlow 1.8s ease-in-out infinite; }
    @keyframes ckGlow { 0%,100%{ box-shadow:0 0 0 0 rgba(0,166,81,.35); } 50%{ box-shadow:0 0 0 18px rgba(0,166,81,0); } }
    .check-svg { width:76px; height:76px; }
    .ck-circle { fill:none; stroke:var(--green); stroke-width:4; stroke-dasharray:227; stroke-dashoffset:227; animation:ckC .6s ease forwards; }
    .ck-tick { fill:none; stroke:var(--green); stroke-width:6; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:70; stroke-dashoffset:70; animation:ckT .4s .5s ease forwards; }
    @keyframes ckC { to { stroke-dashoffset:0; } } @keyframes ckT { to { stroke-dashoffset:0; } }
    .badge { display:inline-block; background:var(--green-l); color:var(--green-d); border:1px solid rgba(0,166,81,.3); border-radius:999px; padding:8px 20px; font-size:13.5px; font-weight:800; margin-bottom:14px; }
    .pend-icon, .rej-icon { font-size:52px; margin-bottom:12px; }
    .rej-icon { width:88px; height:88px; margin:0 auto 14px; border-radius:50%; background:#FFECEC; color:var(--red); display:flex; align-items:center; justify-content:center; font-size:44px; font-weight:900; }
    .pend-icon { animation:vfloat 2.4s ease-in-out infinite; }
    .reject-reason { background:#FFEBEB; border:1px solid #FFD5D5; color:var(--red); border-radius:10px; padding:12px 16px; font-size:13.5px; margin-bottom:16px; text-align:left; }
    .cooldown { background:#FFF7E6; border:1px solid #FFE2A8; color:#92600A; border-radius:10px; padding:12px 16px; font-size:13px; font-weight:600; }
    .result .btn-verify, .result .btn-ghost { width:auto; display:inline-flex; padding:13px 28px; }

    @media (max-width:840px) {
      .checkout { grid-template-columns:1fr; }
      .card-side { order:-1; }
    }
    @media (max-width:520px) {
      .checkout { padding:20px; }
      .grid2 { grid-template-columns:1fr; }
      .topbar .chips .chip:not(.active) span { display:none; }
    }
  `],
})
export class CnicVerificationComponent implements OnInit, OnDestroy {
  private api = environment.apiUrl;

  phase        = signal<Phase>('checking');
  flipped      = signal(false);

  // Live card fields
  cnicNumber = signal('');
  name       = signal('');
  father     = signal('');
  dob        = signal('');
  province   = signal('');
  gender     = signal('');
  issue      = signal('');
  expiry     = signal('');

  cnicValid    = signal(false);
  cnicChecking = signal(false);
  cnicMsg      = signal<string | null>(null);

  cnicDisplay = computed(() => this.cnicNumber() || '•••••-•••••••-•');

  // Attachments (feed real /submit face-match)
  frontAttach  = signal<Attach>({ file: null, preview: null });
  selfieAttach = signal<Attach>({ file: null, preview: null });
  hasImages = computed(() => !!this.frontAttach().file || !!this.selfieAttach().file);

  // Verifying
  progress   = signal(0);
  verifyText = signal('Verifying Identity…');
  private progTimer: any = null;
  private textTimer: any = null;

  // Result
  status        = signal<CnicStatus>('idle');
  rejectReason  = signal<string | null>(null);
  cooldownUntil = signal<Date | null>(null);
  submitError   = signal<string | null>(null);

  inCooldown = computed(() => { const u = this.cooldownUntil(); return !!u && u.getTime() > Date.now(); });
  cooldownHoursLeft = computed(() => { const u = this.cooldownUntil(); return u ? Math.max(0, Math.ceil((u.getTime() - Date.now()) / 3_600_000)) : 0; });

  private readonly MAX_BYTES = 5 * 1024 * 1024;

  constructor(private http: HttpClient) {}

  ngOnInit(): void { this.refreshStatus(true); }
  ngOnDestroy(): void { clearInterval(this.progTimer); clearInterval(this.textTimer); }

  flip(): void { this.flipped.update(v => !v); }

  // ── Status ──
  refreshStatus(initial = false): void {
    if (initial) this.phase.set('checking');
    this.http.get<any>(`${this.api}/cnic/status`).subscribe({
      next: (res) => {
        const d = res?.data || {};
        const s = d?.cnicStatus?.status as CnicStatus;
        this.rejectReason.set(d?.rejectReason || d?.cnicStatus?.reason || null);
        this.cooldownUntil.set(d?.cnicCooldownUntil ? new Date(d.cnicCooldownUntil) : null);
        if (d?.cnicNumber) this.cnicNumber.set(d.cnicNumber);      // masked from server is fine on the card
        if (d?.cnicProvince) this.province.set(d.cnicProvince);
        if (d?.cnicGender)   this.gender.set(d.cnicGender);
        if (s === 'verified' || s === 'pending' || s === 'rejected') { this.status.set(s); this.phase.set('result'); }
        else { this.status.set('idle'); this.phase.set('form'); }
      },
      error: () => { this.status.set('idle'); this.phase.set('form'); },
    });
  }

  // ── CNIC auto-format + live /validate ──
  onCnic(e: Event): void {
    const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 13);
    let out = raw;
    if (raw.length > 5)  out = raw.slice(0, 5) + '-' + raw.slice(5);
    if (raw.length > 12) out = raw.slice(0, 5) + '-' + raw.slice(5, 12) + '-' + raw.slice(12);
    this.cnicNumber.set(out);
    this.cnicValid.set(false);

    if (raw.length < 13) { this.cnicChecking.set(false); this.cnicMsg.set(raw.length ? 'Keep typing…' : null); return; }
    this.cnicChecking.set(true); this.cnicMsg.set('Checking…');
    this.http.post<any>(`${this.api}/cnic/validate`, { cnicNumber: out }).subscribe({
      next: (res) => {
        this.cnicChecking.set(false); this.cnicValid.set(true);
        if (res?.province) this.province.set(res.province);
        if (res?.gender)   this.gender.set(res.gender);
        this.cnicMsg.set(`Valid • ${res?.province || ''}${res?.gender ? ' • ' + res.gender : ''}`.replace(/•\s*$/, '').trim());
      },
      error: (err) => {
        this.cnicChecking.set(false); this.cnicValid.set(false);
        this.cnicMsg.set(err?.error?.message || 'CNIC could not be validated.');
      },
    });
  }

  // ── Attach photos ──
  onAttach(e: Event, which: 'front' | 'selfie'): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > this.MAX_BYTES) {
      this.submitError.set('Please choose an image under 5 MB.'); return;
    }
    this.submitError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      const val = { file, preview: reader.result as string };
      which === 'front' ? this.frontAttach.set(val) : this.selfieAttach.set(val);
    };
    reader.readAsDataURL(file);
  }

  // ── Verify (REAL /submit) ──
  verify(): void {
    if (!this.cnicValid()) return;
    this.submitError.set(null);
    this.phase.set('verifying');
    this.startVerifyAnim();

    const fd = new FormData();
    if (this.frontAttach().file)  fd.append('cnicFront', this.frontAttach().file as File);
    if (this.selfieAttach().file) fd.append('selfie',    this.selfieAttach().file as File);

    this.http.post<any>(`${this.api}/cnic/submit`, fd).subscribe({
      next: (res) => {
        const s = res?.status?.status || 'pending';
        this.finishVerify(() => {
          if (s === 'verified')      this.status.set('verified');
          else if (s === 'rejected') { this.status.set('rejected'); this.rejectReason.set(res?.status?.reason || res?.message || null); }
          else                       this.status.set('pending');
          this.phase.set('result');
        });
      },
      error: (err) => {
        this.finishVerify(() => {
          this.submitError.set(err?.error?.message || 'Verification failed. Please try again.');
          this.cooldownUntil.set(err?.error?.cooldownUntil ? new Date(err.error.cooldownUntil) : this.cooldownUntil());
          this.phase.set('form');
        });
      },
    });
  }

  private startVerifyAnim(): void {
    this.progress.set(0);
    const beats = ['Encrypting your CNIC…', 'Matching your face to the CNIC…', 'Running fraud & liveness checks…', 'Finalising verification…'];
    let bi = 0; this.verifyText.set(beats[0]);
    clearInterval(this.textTimer);
    this.textTimer = setInterval(() => { bi = Math.min(beats.length - 1, bi + 1); this.verifyText.set(beats[bi]); }, 1100);
    clearInterval(this.progTimer);
    this.progTimer = setInterval(() => {
      const p = this.progress(); if (p >= 90) return;
      this.progress.set(p + Math.max(1, Math.round((90 - p) / 12)));
    }, 220);
  }

  private finishVerify(done: () => void): void {
    clearInterval(this.progTimer); clearInterval(this.textTimer);
    this.progress.set(100); this.verifyText.set('Done');
    setTimeout(done, 650);
  }

  // ── Rejected → retry ──
  resubmit(): void {
    this.status.set('idle'); this.rejectReason.set(null);
    this.frontAttach.set({ file: null, preview: null });
    this.selfieAttach.set({ file: null, preview: null });
    this.phase.set('form');
  }
}
