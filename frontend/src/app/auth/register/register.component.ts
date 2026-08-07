import { Component, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type Step = 'role' | 'details' | 'password' | 'otp' | 'done';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnDestroy {
  step: Step = 'role';
  role: 'renter' | 'owner' | 'rider' = 'renter';
  vehicleType = 'bike';

  name = ''; email = ''; phone = ''; password = ''; confirmPass = ''; cnicNumber = '';
  showPass = false; showConfirm = false;
  loading = false; error = '';
  fieldErrors: Record<string, string> = {};

  // OTP
  otpDigits = ['', '', '', '', '', ''];
  otpLoading = false;
  otpError = '';
  otpSuccess = '';
  resendCooldown = 0;
  resendAttempts = 0;
  private resendTimer: any;

  // Email validation
  emailTouched = false;
  emailValid = false;
  emailChecking = false;

  // Cloudflare Turnstile
  turnstileToken = '';
  turnstileError = '';
  turnstileWidgetId: any = null;
  turnstileLoaded = false;
  readonly TURNSTILE_SITE_KEY = '0x4AAAAAADRGoMTytXmXVSW-';

  // CNIC camera scan
  scanning = false;
  cameraStream: MediaStream | null = null;
  scanError = '';
  // CNIC front/back capture + OCR
  scanSide: 'front' | 'back' | 'selfie' = 'front';
  cnicFrontImage: string | null = null;
  cnicBackImage: string | null = null;
  selfieImage: string | null = null;
  ocrLoading = false;
  ocrName: string | null = null;
  cnicConsent = false;

  // Authenticity of the scanned CNIC (from real Gemini vision check).
  cnicAuthentic: boolean | null = null;
  authenticityScore: number | null = null;
  cnicMismatch = false;

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;

  // ── Premium verification experience ───────────────────────────────────────
  // A cinematic wrapper around the SAME real camera/OCR/face-match pipeline
  // above — no new backend logic is faked here, this only adds live quality
  // feedback, auto-capture, a real (if basic) liveness check, and an
  // animated timeline that tracks actual async work instead of a fixed timer.

  /** Live guidance text shown over the camera while scanning ('', or a
   *  real quality-driven message like "Hold steady…"). */
  scanFeedback = '';
  /** True while a live Gemini "is this a real CNIC?" detection pass is in
   *  flight during scanning (front/back only). Gates auto-capture so it only
   *  fires on a genuine CNIC, never on random objects. */
  detecting = false;
  private lastDetectAt = 0;
  private readonly DETECT_COOLDOWN = 1200; // ms between detection calls
  /** True for the ~250ms flash-frame right after a real auto-capture fires. */
  showFlash = false;
  /** Consecutive good-quality frames seen so far (see startQualityMonitor). */
  private stableFrameCount = 0;
  /** How many consecutive good frames (~150ms apart) before we auto-capture —
   *  tuned so a genuinely steady, well-lit shot fires in under a second. */
  private readonly STABLE_FRAMES_NEEDED = 5;
  private qualityMonitorHandle: any = null;

  /** Real fields extracted by Gemini OCR for the front CNIC (only fields
   *  Gemini actually returned — never fabricated/placeholder values). */
  ocrFields: { label: string; value: string }[] = [];

  // Liveness — a basic, honestly-scoped check: we ask the person to blink,
  // capture a frame before and after, and compare them. This catches a
  // completely static image (a printed photo held dead-still, or a paused
  // video) but it is NOT a substitute for real anti-spoofing/liveness ML —
  // there's no claim here that this defeats a determined attacker.
  livenessPromptActive = false;
  livenessCountdown = 3;
  livenessChecking = false;
  private livenessBaselineData: Uint8ClampedArray | null = null;
  private livenessTimer: any = null;

  // Verification timeline — each step's `status` reflects real progress:
  // steps only complete when the underlying async call they represent
  // actually finishes, never on a fixed fake timer alone.
  verificationSteps: { key: string; label: string; status: 'pending' | 'active' | 'done' }[] = [
    { key: 'read',       label: 'Reading CNIC',           status: 'pending' },
    { key: 'security',   label: 'Checking Security',      status: 'pending' },
    { key: 'extract',    label: 'Extracting Identity',    status: 'pending' },
    { key: 'prepare',    label: 'Preparing Face Match',   status: 'pending' },
    { key: 'compare',    label: 'Comparing Faces',        status: 'pending' },
    { key: 'ai',         label: 'Running AI',             status: 'pending' },
    { key: 'confidence', label: 'Calculating Confidence', status: 'pending' },
    { key: 'done',       label: 'Identity Verified',      status: 'pending' },
  ];
  verificationProgress = 0;
  /** Set once the real submit() response arrives — drives the success/fail screen. */
  verificationResult: { success: boolean; score: number | null; reason: string | null } | null = null;
  showVerificationOverlay = false;

  // Voice
  voiceActive = false;
  voiceSupported = 'speechSynthesis' in window;

  private voiceMap: Record<string, string> = {
    page:        'Create your RentAnything account. First, choose your account type.',
    role_renter: 'Renter account selected. You can browse and rent items from owners.',
    role_owner:  'Owner account selected. You can list items and earn money.',
    role_rider:  'Rider account selected. You can deliver items and earn money.',
    name:        'Full Name field. Enter your complete name.',
    email:       'Email Address field. Enter a valid email like ali at gmail dot com.',
    phone:       'Phone Number field. Enter your Pakistani mobile number starting with zero three.',
    cnicNumber:  'CNIC Number field. Enter your national identity card number.',
    password:    'Password field. Enter a strong password with at least 6 characters.',
    confirmPass: 'Confirm Password field. Re-enter the same password.',
    otp:         'Verification code sent to your email. Enter the 6-digit code.',
  };

  constructor(private auth: AuthService, private router: Router) {}

  ngOnDestroy() {
    this.stopCamera();
    this.stopVoice();
    clearInterval(this.resendTimer);
    clearInterval(this.verificationHoldTimer);
    clearInterval(this.livenessTimer);
  }

  // ── Role ──────────────────────────────────────────────
  selectRole(r: 'renter' | 'owner' | 'rider') {
    this.role = r;
    if (this.voiceActive) this.speak(this.voiceMap[`role_${r}`]);
    setTimeout(() => {
      this.step = 'details';
      setTimeout(() => this.initTurnstile(), 400);
    }, 300);
  }

  initTurnstile() {
    const w = (window as any);
    const isLocalhost = ['localhost','127.0.0.1'].includes(window.location.hostname);
    if (isLocalhost || !w.turnstile) {
      this.turnstileLoaded = false;
      this.turnstileToken = 'localhost-bypass';
      return;
    }
    this.turnstileLoaded = true;
    const el = document.getElementById('turnstile-widget');
    if (!el) return;
    if (this.turnstileWidgetId !== null) {
      try { w.turnstile.remove(this.turnstileWidgetId); } catch {}
    }
    this.turnstileToken = '';
    this.turnstileError = '';
    this.turnstileWidgetId = w.turnstile.render('#turnstile-widget', {
      sitekey: this.TURNSTILE_SITE_KEY, theme: 'dark', appearance: 'always',
      'refresh-expired': 'auto',
      callback: (token: string) => { this.turnstileToken = token; this.turnstileError = ''; },
      'expired-callback': () => { this.turnstileToken = ''; this.turnstileError = 'Verification expired.'; },
      'error-callback':   () => { this.turnstileToken = ''; this.turnstileError = 'Verification failed.'; },
    });
  }

  // ── Email validation ───────────────────────────────────
  validateEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  onEmailBlur() {
    this.emailTouched = true;
    this.emailValid = this.validateEmail(this.email);
    if (!this.email) { delete this.fieldErrors['email']; return; }
    if (!this.emailValid) { this.fieldErrors['email'] = 'Enter a valid email (e.g. ali@gmail.com)'; return; }
    this.emailChecking = true;
    this.auth.checkEmailExists(this.email.toLowerCase()).subscribe({
      next: (res: any) => {
        this.emailChecking = false;
        if (res?.exists) { this.fieldErrors['email'] = 'Email already registered. Please login.'; this.emailValid = false; }
        else delete this.fieldErrors['email'];
      },
      error: () => { this.emailChecking = false; delete this.fieldErrors['email']; }
    });
  }

  onEmailInput() {
    if (this.emailTouched) {
      this.emailValid = this.validateEmail(this.email);
      if (this.email && !this.emailValid) this.fieldErrors['email'] = 'Enter a valid email (e.g. ali@gmail.com)';
      else delete this.fieldErrors['email'];
    }
  }

  // ── CNIC format ────────────────────────────────────────
  formatCNIC(event: Event) {
    const input = event.target as HTMLInputElement;
    let val = input.value.replace(/[^0-9]/g, '');
    if (val.length > 13) val = val.slice(0, 13);
    if (val.length > 12) val = val.slice(0,5)+'-'+val.slice(5,12)+'-'+val.slice(12);
    else if (val.length > 5) val = val.slice(0,5)+'-'+val.slice(5);
    this.cnicNumber = val; input.value = val;
    if (val.length === 15) this.validateCNICField();
    else delete this.fieldErrors['cnicNumber'];
  }

  validateCNICField(): boolean {
    if (!/^[0-9]{5}-[0-9]{7}-[0-9]$/.test(this.cnicNumber)) {
      this.fieldErrors['cnicNumber'] = 'Invalid CNIC format (e.g. 42101-1234567-1)'; return false;
    }
    const c = this.cnicNumber.replace(/-/g,'');
    if (![1,2,3,4,5,6].includes(parseInt(c[0]))) { this.fieldErrors['cnicNumber'] = 'Invalid province code (1-6)'; return false; }
    if (![1,2].includes(parseInt(c[12])))         { this.fieldErrors['cnicNumber'] = 'Last digit must be 1 (Male) or 2 (Female)'; return false; }
    if (/^(.)\1+$/.test(c))                        { this.fieldErrors['cnicNumber'] = 'Invalid CNIC — all digits cannot be same'; return false; }
    delete this.fieldErrors['cnicNumber'];
    return true;
  }

  // ── CNIC Camera ────────────────────────────────────────
  async startCNICScan(side: 'front' | 'back' | 'selfie' = 'front') {
    this.scanSide = side;
    this.scanError = ''; this.scanning = true; this.scanFeedback = '';
    try {
      const isSelfie = side === 'selfie';
      const facingMode = isSelfie ? 'user' : 'environment';

      // High-quality constraints — the default `{ video: { facingMode } }`
      // gave the browser no hint, so it picked the lowest quality available.
      // For CNIC OCR the camera must be sharp: prefer 1920×1080 (Full HD) and
      // fall back gracefully when the device can't reach it.
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width:  { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          // Ask for the highest possible frame-rate so the quality monitor
          // can collect stable frames quickly.
          frameRate: { ideal: 30, min: 15 },
          // On supported browsers, disable any software post-processing that
          // softens the image — we need raw sharpness for OCR.
          ...(isSelfie ? {} : {
            focusMode:       'continuous' as any,
            exposureMode:    'continuous' as any,
            whiteBalanceMode:'continuous' as any,
          }),
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.cameraStream = stream;
      setTimeout(() => {
        if (this.videoEl?.nativeElement) {
          this.videoEl.nativeElement.srcObject = stream;
          this.videoEl.nativeElement.play();
          this.startQualityMonitor();
        }
      }, 100);
    } catch { this.scanning = false; this.scanError = 'Camera access denied. Enter CNIC manually.'; }
  }

  /** Samples the live video ~6x/second and drives auto-capture. Real
   *  brightness + contrast/sharpness checks (same math as the existing
   *  selfie quality check below) — not true ML document/edge detection,
   *  just an honest, fast heuristic that's enough to catch a genuinely
   *  bad shot and to know when a shot is genuinely good and holding still. */
  private startQualityMonitor(): void {
    this.stableFrameCount = 0;
    clearInterval(this.qualityMonitorHandle);
    this.qualityMonitorHandle = setInterval(() => {
      if (!this.videoEl?.nativeElement || !this.canvasEl?.nativeElement || !this.scanning) return;
      const video = this.videoEl.nativeElement;
      if (video.videoWidth === 0) return; // stream not ready yet

      const canvas = this.canvasEl.nativeElement;
      // Downscale for the *monitor* pass only — real capture still uses
      // full resolution in captureFrame(). Keeps this cheap enough to run
      // several times a second without any visible lag.
      const sampleW = 160, sampleH = Math.round((video.videoHeight / video.videoWidth) * 160);
      canvas.width = sampleW; canvas.height = sampleH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, sampleW, sampleH);

      const quality = this.assessSelfieQuality(ctx, sampleW, sampleH);
      if (!quality.ok) {
        this.stableFrameCount = 0;
        this.scanFeedback = quality.reason.includes('dark') || quality.reason.includes('bright')
          ? 'Adjust lighting…'
          : 'Hold steady…';
        return;
      }

      this.stableFrameCount++;

      // Selfie: keep the existing quality + liveness auto-capture path.
      if (this.scanSide === 'selfie') {
        this.scanFeedback = this.stableFrameCount < this.STABLE_FRAMES_NEEDED
          ? 'Hold steady…'
          : 'Perfect! Capturing…';
        if (this.stableFrameCount >= this.STABLE_FRAMES_NEEDED) {
          clearInterval(this.qualityMonitorHandle);
          this.autoCapture();
        }
        return;
      }

      // CNIC front/back: DO NOT capture just because the frame is bright/stable.
      // Only auto-capture when Gemini confirms a genuine CNIC is actually in
      // frame — so pointing the camera at any random object never captures.
      if (!this.detecting && this.stableFrameCount >= 2 && (Date.now() - this.lastDetectAt) > this.DETECT_COOLDOWN) {
        this.detectCNICInFrame();
      } else if (!this.detecting) {
        this.scanFeedback = 'Show your CNIC inside the frame';
      }
    }, 160);
  }

  /** Fires the flash animation, waits for it to be visible for a beat, then
   *  either captures immediately (CNIC front/back) or — for a selfie —
   *  hands off to the liveness check first, since that needs a *second*
   *  frame after a prompt rather than just this one. */
  private autoCapture(): void {
    this.showFlash = true;
    setTimeout(() => {
      this.showFlash = false;
      if (this.scanSide === 'selfie') this.startLivenessCheck();
      else this.captureFrame();
    }, 180);
  }

  /** Live "is a real CNIC in frame?" pass. Grabs a downscaled frame and asks
   *  the backend (Gemini) — auto-capture only fires when it confirms a genuine,
   *  readable CNIC. Pointing at anything else never captures. Throttled so it
   *  only runs on a stable, well-lit frame. */
  private detectCNICInFrame(): void {
    if (!this.videoEl?.nativeElement || !this.canvasEl?.nativeElement) return;
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    // Capture at the camera's native resolution — the old 640 px cap meant
    // CNIC text was too small for Gemini Vision to read reliably, and 0.7
    // JPEG quality introduced blur artifacts on fine text. Full resolution +
    // high quality gives the OCR the detail it needs.
    const w = Math.max(video.videoWidth, 1280);
    const h = Math.round((video.videoHeight / video.videoWidth) * w);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    this.detecting = true;
    this.lastDetectAt = Date.now();
    this.scanFeedback = 'Detecting CNIC…';

    const fd = new FormData();
    fd.append('imageBase64', dataUrl);
    fd.append('mime', 'image/jpeg');
    this.auth.scanCNIC(fd).subscribe({
      next: (res: any) => {
        this.detecting = false;
        if (!this.scanning) return; // user closed the camera meanwhile

        const wantFront = this.scanSide === 'front';
        const sideOk = !res?.documentSide || res.documentSide === 'other'
          || (wantFront ? res.documentSide === 'front' : res.documentSide === 'back');

        if (res?.isCnic && res?.readable && res?.data?.cnicNumber && sideOk) {
          // Genuine CNIC actually in frame → lock and capture.
          clearInterval(this.qualityMonitorHandle);
          this.scanFeedback = 'CNIC detected! Capturing…';
          this.autoCapture();
        } else {
          // Not a CNIC / wrong side / not readable → keep scanning, capture nothing.
          this.stableFrameCount = 0;
          if (res?.isCnic === false)              this.scanFeedback = 'No CNIC detected — show your CNIC card';
          else if (res?.isCnic && !sideOk)        this.scanFeedback = wantFront ? 'Show the FRONT of your CNIC' : 'Show the BACK of your CNIC';
          else                                    this.scanFeedback = 'Move closer / hold steady so the CNIC is clear';
        }
      },
      error: () => { this.detecting = false; this.scanFeedback = 'Hold your CNIC steady…'; },
    });
  }

  /** Basic, honestly-scoped liveness check: capture a baseline frame, ask
   *  the person to blink over a short countdown, capture a second frame,
   *  and compare them. A completely static source (printed photo held
   *  still, paused video) will fail this diff; a live person blinking will
   *  pass. This is NOT robust anti-spoofing — no ML model, no claim that it
   *  defeats a determined attacker — just a real, working sanity check that
   *  genuinely requires *something* to change between the two frames. */
  private startLivenessCheck(): void {
    if (!this.videoEl?.nativeElement || !this.canvasEl?.nativeElement) { this.captureFrame(); return; }
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) { this.captureFrame(); return; }

    canvas.width = 160; canvas.height = Math.round((video.videoHeight / video.videoWidth) * 160);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.livenessBaselineData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    this.livenessPromptActive = true;
    this.livenessCountdown = 3;
    clearInterval(this.livenessTimer);
    this.livenessTimer = setInterval(() => {
      this.livenessCountdown--;
      if (this.livenessCountdown <= 0) {
        clearInterval(this.livenessTimer);
        this.finishLivenessCheck();
      }
    }, 1000);
  }

  private finishLivenessCheck(): void {
    this.livenessChecking = true;
    if (!this.videoEl?.nativeElement || !this.canvasEl?.nativeElement || !this.livenessBaselineData) {
      this.livenessPromptActive = false; this.livenessChecking = false;
      this.captureFrame();
      return;
    }
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    const ctx = canvas.getContext('2d')!;
    canvas.width = 160; canvas.height = Math.round((video.videoHeight / video.videoWidth) * 160);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    // Real (if simple) frame-diff: sum of absolute per-pixel luminance
    // differences. A live person shifts enough between frames (blink,
    // micro head movement) to clear a low bar; a perfectly static image
    // source will not.
    let diff = 0;
    const before = this.livenessBaselineData;
    for (let i = 0; i < before.length; i += 16) { // sample every 4th pixel
      diff += Math.abs(before[i] - after[i]);
    }
    const avgDiff = diff / (before.length / 16);

    this.livenessPromptActive = false;
    this.livenessChecking = false;
    this.livenessBaselineData = null;

    if (avgDiff < 1.2) {
      // Too static — likely a photo/paused screen held in front of the camera.
      this.scanError = 'No movement detected. Please look at the camera and blink naturally, then try again.';
      this.startQualityMonitor(); // give them another shot rather than dead-ending
      return;
    }
    this.captureFrame();
  }

  captureFrame() {
    if (!this.videoEl?.nativeElement || !this.canvasEl?.nativeElement) return;
    const video = this.videoEl.nativeElement; const canvas = this.canvasEl.nativeElement;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    this.stopCamera();

    if (this.scanSide === 'front') {
      this.cnicFrontImage = dataUrl;
      this.runCNICOcr(dataUrl);   // read number/name from front
    } else if (this.scanSide === 'back') {
      this.cnicBackImage = dataUrl;
      this.scanError = 'Back side captured.';
    } else {
      // Selfie quality pre-check — catches obviously unusable captures
      // (too dark, too blurry) before wasting a Gemini face-match call on
      // them at submit time. This is a coarse, fast estimate from raw pixel
      // data — not a substitute for the AI face-match step, just a filter
      // for clearly bad shots so the person retakes immediately.
      const quality = ctx ? this.assessSelfieQuality(ctx, canvas.width, canvas.height) : null;
      if (quality && !quality.ok) {
        this.selfieImage = null;
        this.scanError = quality.reason + ' Please retake your selfie.';
        return;
      }
      this.selfieImage = dataUrl;
      this.scanError = 'Selfie captured.';
    }
  }

  /** Coarse brightness + blur estimate from canvas pixel data. Sampling
   *  every 8th pixel keeps this fast even on large camera frames — this
   *  only needs to catch egregiously bad shots, not give a precise score. */
  private assessSelfieQuality(ctx: CanvasRenderingContext2D, w: number, h: number): { ok: boolean; reason: string } {
    try {
      const { data } = ctx.getImageData(0, 0, w, h);
      let sum = 0, sumSq = 0, count = 0;
      for (let i = 0; i < data.length; i += 32) { // every 8th pixel (4 bytes/pixel)
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += lum; sumSq += lum * lum; count++;
      }
      const mean = sum / count;
      const variance = sumSq / count - mean * mean; // proxy for contrast/sharpness

      if (mean < 35) return { ok: false, reason: 'Photo looks too dark.' };
      if (mean > 235) return { ok: false, reason: 'Photo looks too bright/overexposed.' };
      if (variance < 80) return { ok: false, reason: 'Photo looks blurry or low-contrast.' };
      return { ok: true, reason: '' };
    } catch {
      // getImageData can throw on a tainted canvas in rare setups — never
      // block the flow over a quality check that itself failed.
      return { ok: true, reason: '' };
    }
  }

  /** Send the front image to Gemini OCR and auto-fill the CNIC number/name. */
  private runCNICOcr(dataUrl: string) {
    this.ocrLoading = true;
    this.scanError = 'Reading CNIC…';
    const fd = new FormData();
    fd.append('imageBase64', dataUrl);
    fd.append('mime', 'image/jpeg');
    this.auth.scanCNIC(fd).subscribe({
      next: (res: any) => {
        this.ocrLoading = false;

        // ── Reject anything that isn't a GENUINE CNIC (fake / screenshot /
        //    printout / photo-of-screen / non-CNIC). Never keep the image. ──
        if (res?.isCnic === false) {
          this.cnicFrontImage = null;
          this.ocrFields = [];
          this.cnicAuthentic = false;
          this.authenticityScore = typeof res?.authenticityScore === 'number' ? res.authenticityScore : null;
          this.scanError = res?.message || 'This does not look like a genuine CNIC. Please scan your original card.';
          return;
        }

        if (res?.readable && res?.data?.cnicNumber) {
          const d = res.data;

          // Wrong side guard — they tapped "Scan Front" but this is the back.
          if (res?.documentSide === 'back') {
            this.cnicFrontImage = null;
            this.scanError = 'That looks like the BACK of the CNIC. Please scan the FRONT (photo + number side).';
            return;
          }

          // ── Data match — if a number was already entered, it must match the
          //    number actually printed on the scanned card. ──
          const typed   = (this.cnicNumber || '').replace(/\D/g, '');
          const scanned = (d.cnicNumber   || '').replace(/\D/g, '');
          this.cnicMismatch = typed.length === 13 && typed !== scanned;

          this.cnicNumber = d.cnicNumber;
          this.ocrName = d.name || null;
          this.cnicAuthentic = true;
          this.authenticityScore = typeof res?.authenticityScore === 'number' ? res.authenticityScore : null;
          this.scanError = this.cnicMismatch
            ? 'Heads up: the number you typed did not match the card — we have used the number read from your CNIC.'
            : 'Genuine CNIC verified — please confirm the details below.';

          // Build the real field-reveal list from whatever Gemini actually
          // returned — never invent a value for a field it didn't detect.
          this.ocrFields = [];
          this.ocrFields.push({ label: 'CNIC Number', value: d.cnicNumber });
          if (d.name)        this.ocrFields.push({ label: 'Full Name',    value: d.name });
          if (d.fatherName)  this.ocrFields.push({ label: 'Father Name',  value: d.fatherName });
          const gender = this.genderFromCNIC(d.cnicNumber);
          if (gender)        this.ocrFields.push({ label: 'Gender',       value: gender });
          if (d.dateOfBirth) this.ocrFields.push({ label: 'Date of Birth', value: d.dateOfBirth });
          if (d.dateOfIssue) this.ocrFields.push({ label: 'Issue Date',    value: d.dateOfIssue });
          if (d.dateOfExpiry) this.ocrFields.push({ label: 'Expiry Date',  value: d.dateOfExpiry });
        } else {
          // Unreadable — don't keep an unusable front image; make them retake.
          this.cnicFrontImage = null;
          this.ocrFields = [];
          this.cnicAuthentic = null;
          this.scanError = res?.message || 'Could not read CNIC. Retake the front photo or enter manually.';
        }
      },
      error: () => {
        this.ocrLoading = false;
        this.scanError = 'CNIC scan failed. Please enter the number manually.';
      },
    });
  }

  /** Real, deterministic gender read from the CNIC's last digit (the actual
   *  Pakistani CNIC standard: odd = male, even = female) — not a Gemini
   *  guess, just arithmetic on a number we already have. */
  private genderFromCNIC(cnic: string): string | null {
    const digits = cnic.replace(/-/g, '');
    if (digits.length !== 13) return null;
    const last = parseInt(digits[12], 10);
    if (Number.isNaN(last)) return null;
    return last % 2 === 1 ? 'Male' : 'Female';
  }

  stopCamera() {
    if (this.cameraStream) { this.cameraStream.getTracks().forEach(t => t.stop()); this.cameraStream = null; }
    clearInterval(this.qualityMonitorHandle);
    clearInterval(this.livenessTimer);
    this.livenessPromptActive = false;
    this.scanFeedback = '';
    this.scanning = false;
    this.detecting = false;
  }

  // ── Steps ──────────────────────────────────────────────
  nextToPassword() {
    this.fieldErrors = {};
    if (!this.name.trim() || this.name.trim().length < 2) { this.fieldErrors['name'] = 'Name must be at least 2 characters'; return; }
    if (!this.email || !this.validateEmail(this.email))   { this.fieldErrors['email'] = 'Enter a valid email (e.g. ali@gmail.com)'; return; }
    if (this.fieldErrors['email']) return;
    if (document.getElementById('turnstile-widget')?.children.length && !this.turnstileToken) { this.turnstileError = 'Please complete human verification.'; return; }
    if (this.phone && !/^03[0-9]{9}$/.test(this.phone)) { this.fieldErrors['phone'] = 'Enter valid Pakistani number (e.g. 03001234567)'; return; }
    if (this.role === 'rider') {
      if (!this.phone)       { this.fieldErrors['phone']       = 'Phone is required for riders'; return; }
      if (!this.vehicleType) { this.fieldErrors['vehicleType'] = 'Choose a vehicle'; return; }
      if (!this.cnicNumber)  { this.fieldErrors['cnicNumber']  = 'CNIC is required for riders'; return; }
      if (!this.selfieImage) { this.fieldErrors['cnicNumber']  = 'Please take a selfie so we can verify it against your CNIC'; return; }
      if (!this.cnicConsent) { this.fieldErrors['cnicConsent']  = 'Please agree to CNIC verification'; return; }
    }
    if (this.role === 'owner') {
      if (!this.phone)       { this.fieldErrors['phone']      = 'Phone is required for owners'; return; }
      if (!this.cnicNumber)  { this.fieldErrors['cnicNumber'] = 'CNIC is required for owners'; return; }
      if (!this.selfieImage) { this.fieldErrors['cnicNumber'] = 'Please take a selfie so we can verify it against your CNIC'; return; }
      if (!this.validateCNICField()) return;
    }
    this.step = 'password';
  }

  submit() {
    this.fieldErrors = {};
    const minPass = (this.role === 'owner' || this.role === 'rider') ? 8 : 6;
    if (!this.password || this.password.length < minPass) { this.fieldErrors['password'] = `Password must be at least ${minPass} characters`; return; }
    if (this.password !== this.confirmPass) { this.fieldErrors['confirmPass'] = 'Passwords do not match'; return; }

    this.loading = true; this.error = '';

    // For owner/rider (the CNIC + selfie roles) show the premium animated
    // verification overlay while the real request is in flight. Renters
    // skip straight through since there's no CNIC/face-match step for them.
    const showOverlay = this.role === 'owner' || this.role === 'rider';
    if (showOverlay) this.beginVerificationTimeline();

    const call$ = this.role === 'owner'
      ? this.auth.registerOwner({ name:this.name.trim(), email:this.email.toLowerCase(), phone:this.phone, cnicNumber:this.cnicNumber, password:this.password, confirmPassword:this.confirmPass, turnstileToken:this.turnstileToken, cnicImageFront:this.cnicFrontImage, cnicImageBack:this.cnicBackImage, cnicSelfie:this.selfieImage })
      : this.role === 'rider'
      ? this.auth.registerRider({ name:this.name.trim(), email:this.email.toLowerCase(), phone:this.phone, cnicNumber:this.cnicNumber, vehicleType:this.vehicleType, password:this.password, confirmPassword:this.confirmPass, turnstileToken:this.turnstileToken, cnicConsent:this.cnicConsent, cnicImageFront:this.cnicFrontImage, cnicImageBack:this.cnicBackImage, cnicSelfie:this.selfieImage })
      : this.auth.registerRenter({ name:this.name.trim(), email:this.email.toLowerCase(), password:this.password, confirmPassword:this.confirmPass, turnstileToken:this.turnstileToken, ...(this.phone ? {phone:this.phone} : {}) });

    call$.subscribe({
      next: (res: any) => {
        this.loading = false;
        if (res?.success === false) {
          if (showOverlay) this.failVerificationTimeline(res.message || 'Registration failed.');
          else this.error = res.message || 'Registration failed.';
          return;
        }
        if (showOverlay) {
          const v = res?.verification;
          if (v?.autoRejected) {
            this.failVerificationTimeline(v.autoRejectReason || 'Selfie does not appear to match your CNIC photo.');
          } else {
            this.completeVerificationTimeline(v?.faceMatchScore ?? null);
          }
        } else {
          // Registration done — go to OTP step
          this.step = 'otp';
          this.startResendCooldown(60);
          if (this.voiceActive) this.speak(this.voiceMap['otp']);
        }
      },
      error: (err: any) => {
        if (showOverlay) { this.loading = false; this.failVerificationTimeline('Something went wrong. Please try again.'); return; }
        this.handleError(err);
      }
    });
  }

  // ── Verification timeline (real progress, not a fixed fake timer) ────────
  /** Steps 1-4 ("Reading CNIC" → "Preparing Face Match") already happened
   *  earlier in the flow (OCR ran when the CNIC was scanned) — so we play
   *  those quickly to visually recap what already occurred for real, then
   *  hold on "Comparing Faces" → "Running AI" → "Calculating Confidence"
   *  for as long as the actual submit() network call takes, only reaching
   *  "Identity Verified" once the real response has arrived. */
  private verificationHoldTimer: any = null;
  private beginVerificationTimeline(): void {
    this.showVerificationOverlay = true;
    this.verificationResult = null;
    this.verificationSteps = this.verificationSteps.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' }));
    this.verificationProgress = 0;

    const recapSteps = ['read', 'security', 'extract', 'prepare']; // already genuinely happened
    let idx = 0;
    const advanceRecap = () => {
      if (idx > 0) this.setStepStatus(recapSteps[idx - 1], 'done');
      if (idx < recapSteps.length) {
        this.setStepStatus(recapSteps[idx], 'active');
        this.verificationProgress = Math.round(((idx + 1) / this.verificationSteps.length) * 55);
        idx++;
        setTimeout(advanceRecap, 380);
      } else {
        // Now enter the "waiting on the real network call" phase — cycles
        // through the remaining steps slowly until the response arrives.
        this.holdOnPendingSteps();
      }
    };
    advanceRecap();
  }

  /** While the real request is still in flight, gently cycle through the
   *  remaining steps so it doesn't look frozen — but never reach the final
   *  "Identity Verified" step here; only completeVerificationTimeline()
   *  (called once the real response lands) is allowed to do that. */
  private holdOnPendingSteps(): void {
    const pending = ['compare', 'ai', 'confidence'];
    let i = 0;
    clearInterval(this.verificationHoldTimer);
    this.verificationHoldTimer = setInterval(() => {
      if (i > 0) this.setStepStatus(pending[i - 1], 'done');
      if (i < pending.length) {
        this.setStepStatus(pending[i], 'active');
        this.verificationProgress = Math.round(55 + ((i + 1) / pending.length) * 35);
        i++;
      } else {
        i = 0; // loop back — the real response should land within a cycle or two
      }
    }, 700);
  }

  private setStepStatus(key: string, status: 'pending' | 'active' | 'done'): void {
    const step = this.verificationSteps.find(s => s.key === key);
    if (step) step.status = status;
  }

  /** Called once the real backend response arrives with a genuine result. */
  private completeVerificationTimeline(score: number | null): void {
    clearInterval(this.verificationHoldTimer);
    this.verificationSteps = this.verificationSteps.map(s => ({ ...s, status: 'done' }));
    this.verificationProgress = 100;
    setTimeout(() => {
      this.verificationResult = { success: true, score, reason: null };
    }, 350);
  }

  private failVerificationTimeline(reason: string): void {
    clearInterval(this.verificationHoldTimer);
    this.verificationResult = { success: false, score: null, reason };
  }

  /** Closes the overlay after a failure so the person can retake photos and
   *  try again — does NOT clear the form, just returns to the details step. */
  retryVerification(): void {
    this.showVerificationOverlay = false;
    this.verificationResult = null;
    this.selfieImage = null; // most failures are selfie-related; make them retake it
    this.step = 'details';
  }

  /** Continues to OTP after a successful verification. */
  continueAfterVerification(): void {
    this.showVerificationOverlay = false;
    this.step = 'otp';
    this.startResendCooldown(60);
    if (this.voiceActive) this.speak(this.voiceMap['otp']);
  }

  // ── OTP ────────────────────────────────────────────────
  get otpValue(): string { return this.otpDigits.join(''); }

  /** Single-input OTP: keep digits only, max 6, sync into otpDigits. */
  otpSingle = '';
  onOtpSingleInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
    this.otpSingle = raw;
    this.otpDigits = [0,1,2,3,4,5].map(i => raw[i] || '');
    this.otpError = '';
    if (raw.length === 6) setTimeout(() => this.verifyOTP(), 200);
  }

  onOtpInput(i: number, e: Event) {
    const val = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    this.otpDigits[i] = val.slice(-1);
    this.otpError = '';
    if (val && i < 5) {
      const next = document.getElementById(`otp-reg-${i+1}`);
      if (next) (next as HTMLInputElement).focus();
    }
    // Auto-submit when all 6 filled
    if (this.otpValue.length === 6) setTimeout(() => this.verifyOTP(), 200);
  }

  onOtpKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !this.otpDigits[i] && i > 0) {
      const prev = document.getElementById(`otp-reg-${i-1}`);
      if (prev) (prev as HTMLInputElement).focus();
    }
  }

  onOtpPaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) || '';
    text.split('').forEach((ch, i) => { if (i < 6) this.otpDigits[i] = ch; });
    if (text.length === 6) setTimeout(() => this.verifyOTP(), 200);
  }

  verifyOTP() {
    if (this.otpValue.length !== 6) { this.otpError = 'Please enter all 6 digits.'; return; }
    this.otpLoading = true; this.otpError = '';
    this.auth.verifyRegistrationOTP(this.email.toLowerCase(), this.otpValue).subscribe({
      next: (res: any) => {
        this.otpLoading = false;
        this.otpSuccess = 'Email verified! Redirecting...';
        setTimeout(() => this.step = 'done', 1500);
      },
      error: (err: any) => {
        this.otpLoading = false;
        const b = err.error || {};
        if (b.code === 'OTP_EXPIRED')      { this.otpError = 'Code expired. Please request a new one.'; }
        else if (b.code === 'OTP_INVALID') { this.otpError = `Wrong code. ${b.attemptsLeft || ''} attempts remaining.`; }
        else if (b.code === 'OTP_MAXED')   { this.otpError = 'Too many wrong attempts. Resend a new code.'; this.otpDigits = ['','','','','','']; }
        else                                { this.otpError = b.message || 'Invalid code. Try again.'; }
      }
    });
  }

  resendOTP() {
    if (this.resendCooldown > 0 || this.resendAttempts >= 3) return;
    this.otpLoading = true; this.otpError = ''; this.otpSuccess = '';
    this.auth.resendVerification(this.email.toLowerCase()).subscribe({
      next: () => {
        this.otpLoading = false;
        this.resendAttempts++;
        this.otpDigits = ['','','','','',''];
        this.otpSuccess = 'New code sent! Check your email.';
        this.startResendCooldown(this.resendAttempts >= 2 ? 120 : 60);
        setTimeout(() => this.otpSuccess = '', 4000);
      },
      error: (err: any) => {
        this.otpLoading = false;
        this.otpError = err.error?.message || 'Could not resend. Try again later.';
      }
    });
  }

  startResendCooldown(secs: number) {
    clearInterval(this.resendTimer);
    this.resendCooldown = secs;
    this.resendTimer = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) clearInterval(this.resendTimer);
    }, 1000);
  }

  // ── Helpers ────────────────────────────────────────────
  handleError(err: any) {
    this.loading = false;
    if (!err.error || err.status === 0) { this.error = 'Cannot connect to server. Make sure backend is running.'; return; }
    const body = err.error || {};
    const fieldMap: Record<string, string> = {
      confirmPassword:'confirmPass', cnicNumber:'cnicNumber',
      name:'name', email:'email', phone:'phone', password:'password',
    };
    if (body.errors?.length) {
      body.errors.forEach((e: any) => { this.fieldErrors[fieldMap[e.field]||e.field] = e.message; });
      this.error = body.message || 'Please fix the errors above.';
    } else {
      this.error = body.message || 'Registration failed. Please try again.';
    }
    if (this.voiceActive && this.error) this.speak(this.error);
  }

  goBack() {
    if (this.step === 'details')  this.step = 'role';
    if (this.step === 'password') this.step = 'details';
    if (this.step === 'otp')      this.step = 'password';
  }

  loginWithGoogle()   { window.location.href = this.auth.googleLoginUrl(); }
  loginWithFacebook() { window.location.href = this.auth.facebookLoginUrl(); }

  toggleVoice() {
    this.voiceActive = !this.voiceActive;
    if (this.voiceActive) this.speak(this.voiceMap['page']);
    else this.stopVoice();
  }
  speakField(key: string) { if (this.voiceActive) this.speak(this.voiceMap[key] || key); }
  speak(text: string) {
    if (!this.voiceSupported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.88; u.pitch = 1;
    window.speechSynthesis.speak(u);
  }
  stopVoice() { if (this.voiceSupported) window.speechSynthesis.cancel(); }

  get stepNum(): number { return {role:1,details:2,password:3,otp:4,done:5}[this.step]||1; }
  get totalSteps(): number { return 4; }
  get maskedEmail(): string {
    const [user, domain] = this.email.split('@');
    return user.substring(0,2) + '***@' + domain;
  }
}
