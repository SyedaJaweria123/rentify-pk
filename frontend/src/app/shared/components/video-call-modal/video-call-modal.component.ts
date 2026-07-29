import { Component, Input, Output, EventEmitter, OnDestroy, ElementRef, ViewChild, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { HttpClient }       from '@angular/common/http';
import { environment }      from '../../../../environments/environment';

@Component({
  selector  : 'app-video-call-modal',
  standalone: true,
  imports   : [CommonModule],
  template  : `
    <!-- ══ Incoming Call — full-screen, WhatsApp-style ══ -->
    @if (mode === 'incoming') {
      <div class="rf-call-screen rf-incoming">
        <div class="rf-call-bg"></div>

        <div class="rf-call-top">
          <span class="rf-call-status">{{ callType === 'voice' ? 'Incoming Voice Call' : 'Incoming Video Call' }}</span>
        </div>

        <div class="rf-call-center">
          <div class="rf-avatar-ring">
            <div class="rf-avatar-circle">{{ initial() }}</div>
          </div>
          <h2 class="rf-caller-name">{{ callerName }}</h2>
          <p class="rf-call-sub">Rentify {{ callType === 'voice' ? 'voice call' : 'video call' }}...</p>
        </div>

        <div class="rf-call-actions">
          <div class="rf-action-col">
            <button class="rf-action-btn rf-decline" (click)="onDecline.emit()" aria-label="Decline">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"/></svg>
            </button>
            <span class="rf-action-label">Decline</span>
          </div>
          <div class="rf-action-col">
            <button class="rf-action-btn rf-accept" (click)="onAccept.emit()" aria-label="Accept">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </button>
            <span class="rf-action-label">Accept</span>
          </div>
        </div>
      </div>
    }

    <!-- ══ Active Call ══ -->
    @if (mode === 'active') {
      <div class="rf-call-screen rf-active">
        <div #zegoContainer class="rf-zego-container"></div>
        @if (loading) {
          <div class="rf-connecting-overlay">
            <div class="rf-avatar-ring rf-avatar-ring-sm">
              <div class="rf-avatar-circle rf-avatar-circle-sm">{{ initial() }}</div>
            </div>
            <h3 class="rf-caller-name rf-caller-name-sm">{{ callerName }}</h3>
            <div class="rf-connecting-row">
              <span class="rf-dot"></span><span class="rf-dot"></span><span class="rf-dot"></span>
              <span class="rf-connecting-text">{{ statusText }}</span>
            </div>
            <button *ngIf="showCloseFallback" class="rf-close-fallback-btn" (click)="onEnd.emit()">
              Call Khatam Karein
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .rf-call-screen {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; flex-direction: column;
      font-family: inherit;
    }

    /* ── Incoming call screen ── */
    .rf-incoming {
      background: linear-gradient(160deg, #16331f 0%, #1F5435 48%, #2c7a4a 100%);
      color: #fff; align-items: center;
    }
    .rf-call-bg {
      position: absolute; inset: 0; opacity: .5;
      background-image: radial-gradient(circle at 20% 18%, rgba(255,255,255,.05), transparent 45%),
                         radial-gradient(circle at 85% 80%, rgba(255,255,255,.06), transparent 50%);
    }
    .rf-call-top { margin-top: 56px; text-align: center; z-index: 1; }
    .rf-call-status {
      font-size: 13px; letter-spacing: .03em; font-weight: 600;
      color: rgba(255,255,255,.78); text-transform: uppercase;
    }

    .rf-call-center {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 1; padding: 0 24px; text-align: center;
    }

    .rf-avatar-ring {
      width: 144px; height: 144px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.08);
      animation: rfPulseRing 1.8s ease-out infinite;
      margin-bottom: 28px;
    }
    .rf-avatar-circle {
      width: 112px; height: 112px; border-radius: 50%;
      background: linear-gradient(135deg, #EAF3DE, #c7e0a8);
      color: #1F5435; font-size: 42px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,.25);
    }
    @keyframes rfPulseRing {
      0%   { box-shadow: 0 0 0 0 rgba(255,255,255,.22); }
      70%  { box-shadow: 0 0 0 22px rgba(255,255,255,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    }

    .rf-caller-name { font-size: 26px; font-weight: 700; margin: 0 0 6px; }
    .rf-call-sub { font-size: 14.5px; color: rgba(255,255,255,.75); margin: 0; }

    .rf-call-actions {
      z-index: 1; display: flex; justify-content: center; gap: 76px;
      padding-bottom: 64px;
    }
    .rf-action-col { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .rf-action-btn {
      width: 64px; height: 64px; border-radius: 50%; border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: transform .12s, box-shadow .15s;
      box-shadow: 0 6px 18px rgba(0,0,0,.3);
    }
    .rf-action-btn:hover { transform: scale(1.06); }
    .rf-action-btn:active { transform: scale(.96); }
    .rf-decline { background: #e53e3e; }
    .rf-accept  { background: #22c55e; }
    .rf-action-label { font-size: 12.5px; color: rgba(255,255,255,.85); font-weight: 500; }

    /* ── Active call screen ── */
    .rf-active { background: #0a0a0a; }
    .rf-zego-container { width: 100%; height: 100%; }

    .rf-connecting-overlay {
      position: absolute; inset: 0; z-index: 2;
      background: linear-gradient(160deg, #16331f 0%, #1F5435 60%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #fff; gap: 6px; padding: 0 24px; text-align: center;
    }
    .rf-avatar-ring-sm { width: 104px; height: 104px; margin-bottom: 18px; }
    .rf-avatar-circle-sm { width: 80px; height: 80px; font-size: 30px; }
    .rf-caller-name-sm { font-size: 19px; margin-bottom: 14px; }

    .rf-connecting-row { display: flex; align-items: center; gap: 8px; }
    .rf-dot {
      width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.7);
      animation: rfDotBounce 1.2s ease-in-out infinite;
    }
    .rf-dot:nth-child(2) { animation-delay: .15s; }
    .rf-dot:nth-child(3) { animation-delay: .3s; }
    @keyframes rfDotBounce { 0%,80%,100% { opacity: .3; } 40% { opacity: 1; } }
    .rf-connecting-text { font-size: 13.5px; color: rgba(255,255,255,.85); margin-left: 4px; }

    .rf-close-fallback-btn {
      margin-top: 22px; padding: 11px 22px; border-radius: 24px; border: none;
      background: rgba(255,255,255,.14); color: #fff; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: background .15s;
    }
    .rf-close-fallback-btn:hover { background: rgba(255,255,255,.22); }
  `],
})
export class VideoCallModalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('zegoContainer') zegoContainer?: ElementRef<HTMLDivElement>;

  @Input() mode: 'incoming' | 'active' = 'incoming';
  @Input() callerName = '';
  @Input() roomId = '';
  @Input() callType: 'video' | 'voice' = 'video';

  @Output() onAccept  = new EventEmitter<void>();
  @Output() onDecline = new EventEmitter<void>();
  @Output() onEnd      = new EventEmitter<void>();

  loading = true;
  statusText = 'Connecting...';
  showCloseFallback = false;

  private zp: any = null;
  private joinAttempted = false;
  private endedAlready = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  initial(): string {
    return (this.callerName || 'U').trim().charAt(0).toUpperCase();
  }

  ngAfterViewInit(): void {
    if (this.mode === 'active' && !this.joinAttempted) {
      this.joinAttempted = true;
      setTimeout(() => this.initZego(), 0);
    }
  }

  private async initZego(): Promise<void> {
    if (!this.roomId || !this.zegoContainer || this.zp) return;

    const fallbackTimer = setTimeout(() => {
      if (this.loading) {
        this.statusText = 'Connection mein zyada waqt lag raha hai...';
        this.showCloseFallback = true;
        this.cdr.detectChanges();
      }
    }, 10000);

    try {
      const http: any = this.http;
      const res: any = await http.post(environment.apiUrl + '/video/token', {}).toPromise();

      const mod = await import('@zegocloud/zego-uikit-prebuilt');
      const ZegoUIKitPrebuilt = mod.ZegoUIKitPrebuilt;

      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
        res.appId,
        res.token,
        this.roomId,
        res.userId,
        res.userName
      );

      const zp = ZegoUIKitPrebuilt.create(kitToken);
      this.zp = zp;

      const isVoice = this.callType === 'voice';

      zp.joinRoom({
        container: this.zegoContainer.nativeElement,
        scenario: {
          mode: ZegoUIKitPrebuilt.OneONoneCall,
        },
        turnOnMicrophoneWhenJoining : true,
        turnOnCameraWhenJoining     : !isVoice,
        showMyCameraToggleButton    : !isVoice,
        showAudioVideoSettingsButton: true,
        showPreJoinView             : false,
        // No confirmation popup when the LOCAL user clicks "leave" —
        // hanging up should be instant, like a real phone call.
        showLeaveRoomConfirmDialog  : false,
        onJoinRoom: () => {
          clearTimeout(fallbackTimer);
          this.loading = false;
          this.cdr.detectChanges();
        },
        // Local user clicked "leave" / closed the tab.
        onLeaveRoom: () => this.endCallOnce(),
        // REMOTE user left the room (they hung up, lost connection, etc.) —
        // this is what makes the call auto-end on THIS side too, with zero
        // confirmation needed, exactly like a real phone call disconnecting.
        onUserLeave: (users: any[]) => {
          if (users?.length) this.endCallOnce();
        },
      });

    } catch (err) {
      clearTimeout(fallbackTimer);
      console.error('[ZegoCloud] init error:', err);
      this.statusText = 'Call shuru nahi ho saka';
      this.showCloseFallback = true;
      this.cdr.detectChanges();
    }
  }

  /** Guards against onLeaveRoom + onUserLeave both firing for the same hangup. */
  private endCallOnce(): void {
    if (this.endedAlready) return;
    this.endedAlready = true;
    this.onEnd.emit();
  }

  ngOnDestroy(): void {
    try { this.zp?.destroy?.(); } catch {}
    this.zp = null;
  }
}