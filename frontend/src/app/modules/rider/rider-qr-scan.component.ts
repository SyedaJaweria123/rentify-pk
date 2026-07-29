import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Html5Qrcode } from 'html5-qrcode';
import { RiderService, Evidence } from './rider.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-rider-qr-scan',
  standalone: true,
  imports: [CommonModule, FormsModule, MatProgressSpinnerModule],
  templateUrl: './rider-qr-scan.component.html',
  styleUrls: ['./rider-qr-scan.component.css'],
})
export class RiderQrScanComponent implements OnInit, OnDestroy {
  scanning = signal(false);
  verifying = signal(false);
  submitting = signal(false);
  verified = signal<any | null>(null);
  photo = signal<File | null>(null);
  photoPreview = signal<string | null>(null);
  action = signal<'pickup' | 'deliver' | ''>('');
  manualCode = signal('');
  showManual = signal(false);

  private assignmentId = '';
  private scannedCode = '';
  private scanner: Html5Qrcode | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rider: RiderService,
    private api: ApiService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.assignmentId = this.route.snapshot.queryParamMap.get('assignment') || '';
    const act = this.route.snapshot.queryParamMap.get('action');
    if (act === 'pickup' || act === 'deliver') this.action.set(act);
  }

  ngOnDestroy(): void { this.cleanup(); }

  async startScan(): Promise<void> {
    this.scanning.set(true);
    try {
      this.scanner = new Html5Qrcode('qr-reader', {
        // Use the browser's native barcode detector when available — it's far
        // more reliable at picking up QR codes shown on a screen than the JS
        // fallback decoder.
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      } as any);

      // A responsive qrbox that fills most of the video frame makes it much
      // easier to detect a QR held up to a laptop camera.
      const qrboxFn = (vw: number, vh: number) => {
        const size = Math.floor(Math.min(vw, vh) * 0.8);
        return { width: size, height: size };
      };
      const config = {
        fps: 15,
        qrbox: qrboxFn,
        aspectRatio: 1.0,
        // Only look for QR codes (skip other barcode formats) — faster.
      };
      const onOk = (decodedText: string) => { this.onScanned(decodedText); };
      const onErr = () => { /* per-frame decode failure — ignore */ };

      // Laptops usually have only a front camera, so 'environment' (back) fails.
      // Try back camera first, then fall back to front, then to any available camera.
      try {
        await this.scanner.start({ facingMode: 'environment' }, config, onOk, onErr);
      } catch {
        try {
          await this.scanner.start({ facingMode: 'user' }, config, onOk, onErr);
        } catch {
          // Last resort: pick the first camera the device reports.
          const cams = await Html5Qrcode.getCameras();
          if (cams && cams.length) {
            await this.scanner.start(cams[0].id, config, onOk, onErr);
          } else {
            throw new Error('No camera found');
          }
        }
      }
    } catch (e) {
      this.scanning.set(false);
      this.snack.open('Could not access camera. Please allow camera access, or paste the code below.', 'Dismiss', { duration: 6000 });
    }
  }

  async stopScan(): Promise<void> { await this.cleanup(); this.scanning.set(false); }

  /**
   * Scan a QR code from an uploaded image file. Much more reliable than a
   * laptop camera pointed at a screen — the rider can just upload a screenshot
   * or photo of the QR code.
   */
  async scanFromImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    if (!file) return;

    this.verifying.set(true);

    // scanFile needs a container that is actually laid out (has width/height).
    // We keep it in the normal flow but visually hidden so the browser still
    // renders the <img> the library injects — an off-screen/display:none box
    // makes the decode silently fail on some browsers.
    const tmpId = 'qr-file-scan-' + Date.now();
    const tmpEl = document.createElement('div');
    tmpEl.id = tmpId;
    tmpEl.style.cssText =
      'position:fixed;bottom:0;right:0;width:320px;height:320px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;';
    document.body.appendChild(tmpEl);

    const tmp = new Html5Qrcode(tmpId, { verbose: false } as any);
    try {
      // showImage = true → the library paints the image into the container,
      // which its decoder then reads. This is far more reliable than false.
      const decoded = await tmp.scanFile(file, true);
      this.verifying.set(false);
      this.verify(decoded);
    } catch (err) {
      console.warn('[scanFromImage] decode failed:', err);
      this.verifying.set(false);
      this.snack.open('No QR code found in that image. Make sure the whole QR is visible and in focus, then try again — or paste the code.', 'Dismiss', { duration: 6000 });
    } finally {
      try { await tmp.clear(); } catch { /* noop */ }
      tmpEl.remove();
    }
    input.value = '';
  }

  private async cleanup(): Promise<void> {
    if (this.scanner) {
      try { await this.scanner.stop(); this.scanner.clear(); } catch (e) { /* already stopped */ }
      this.scanner = null;
    }
  }

  private onScanned(code: string): void {
    if (this.verified() || this.verifying()) return;
    this.cleanup();
    this.scanning.set(false);
    this.verify(code);
  }

  verifyManual(code: string): void {
    if (!code || !code.trim()) { this.snack.open('Enter a QR code.', 'Dismiss', { duration: 3000 }); return; }
    this.verify(code.trim());
  }

  private verify(code: string): void {
    this.scannedCode = code;
    this.verifying.set(true);
    this.rider.scanQR(code).subscribe({
      next: (res) => { this.verified.set(res?.data || null); this.verifying.set(false); },
      error: (err) => { this.verifying.set(false); this.snack.open(err?.error?.message || 'Invalid QR.', 'Dismiss', { duration: 5000 }); },
    });
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files && input.files.length ? input.files[0] : null;
    this.photo.set(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => this.photoPreview.set(reader.result as string);
      reader.readAsDataURL(f);
    } else { this.photoPreview.set(null); }
  }

  confirmAction(): void {
    const f = this.photo();
    if (!f || this.submitting()) return;
    const id = this.assignmentId || this.verified()?.assignmentId;
    if (!id) { this.snack.open('Missing assignment.', 'Dismiss', { duration: 4000 }); return; }

    this.submitting.set(true);
    // Upload evidence first → get { url, publicId }, then pickup/deliver
    const fd = new FormData();
    fd.append('image', f);
    this.api.upload<any>('/uploads/image', fd).subscribe({
      next: (up) => {
        const ev: Evidence[] = [{ url: up?.data?.url || up?.url, publicId: up?.data?.publicId || up?.publicId }];
        const done = () => { this.submitting.set(false); this.snack.open('Done!', 'OK', { duration: 3000 }); this.router.navigate(['/rider']); };
        const fail = (err: any) => { this.submitting.set(false); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 5000 }); };
        if (this.action() === 'pickup') this.rider.pickup(id, ev, this.scannedCode).subscribe({ next: done, error: fail });
        else this.rider.deliver(id, ev).subscribe({ next: done, error: fail });
      },
      error: (err) => { this.submitting.set(false); this.snack.open(err?.error?.message || 'Photo upload failed.', 'Dismiss', { duration: 5000 }); },
    });
  }

  goBack(): void { this.router.navigate(['/rider']); }
}
