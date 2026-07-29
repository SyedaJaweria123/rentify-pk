import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RiderService }    from './rider.service';
import { SocketService }   from '../../core/services/socket.service';
import { AuthService }     from '../../services/auth.service';
import { SwitchAccountBannerComponent } from '../../shared/components/switch-account-banner/switch-account-banner.component';

declare const Chart: any;

@Component({
  selector: 'app-rider-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatProgressSpinnerModule, MatSlideToggleModule, SwitchAccountBannerComponent],
  templateUrl: './rider-dashboard.component.html',
  styleUrls: ['./rider-dashboard.component.css'],
})
export class RiderDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('trendChart')    trendChartRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart')   statusChartRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('deliveryBar')   deliveryBarRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('completionRing') completionRingRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('acceptChart')   acceptChartRef!:   ElementRef<HTMLCanvasElement>;

  loading = signal(true);
  savingAvail = signal(false);
  available = signal(false);
  filter = signal<'active' | 'completed'>('active');
  assignments = signal<any[]>([]);
  recentAssignments = signal<any[]>([]);
  searchQuery = signal<string>('');
  searchResults = signal<any[]>([]);
  busyId   = signal<string | null>(null);
  copiedId = signal<string | null>(null);
  earnings = signal<any | null>(null);
  loadingEarnings = signal(true);
  referral = signal<any | null>(null);
  loadingReferral = signal(true);
  decliningId = signal<string | null>(null);
  copiedReferral = signal(false);

  private trendChartInst:      any = null;
  private statusChartInst:     any = null;
  private deliveryBarInst:     any = null;
  private completionRingInst:  any = null;
  private acceptChartInst:     any = null;
  private viewReady = false;

  // GPS tracking
  private locationInterval: any = null;

  constructor(
    private rider : RiderService,
    private socket: SocketService,
    private auth  : AuthService,
    private router: Router,
    private snack : MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadEarnings();
    this.loadReferral();
  }

  ngAfterViewInit(): void { this.viewReady = true; this.scheduleChartDraw(); }

  ngOnDestroy(): void {
    this.stopLocationTracking();
    this.trendChartInst?.destroy();
    this.statusChartInst?.destroy();
    this.deliveryBarInst?.destroy();
    this.completionRingInst?.destroy();
    this.acceptChartInst?.destroy();
  }

  private load(): void {
    this.loading.set(true);
    this.rider.getAssignments(this.filter()).subscribe({
      next: (res) => { this.assignments.set(res?.data || []); this.loading.set(false); },
      error: () => { this.assignments.set([]); this.loading.set(false); },
    });
    this.loadRecent();
  }

  /** Recent orders for the side panel — always the 5 latest regardless of filter. */
  private loadRecent(): void {
    this.rider.getAssignments('').subscribe({
      next: (res) => {
        const all = (res?.data || []).sort(
          (a: any, b: any) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()
        );
        this.recentAssignments.set(all.slice(0, 5));
        this.allForSearch = all;   // keep the full list around for search
      },
      error: () => { this.recentAssignments.set([]); },
    });
  }

  // Full assignment list used by the search box (loaded alongside recent).
  private allForSearch: any[] = [];

  onSearch(q: string): void {
    this.searchQuery.set(q);
    const term = q.trim().toLowerCase();
    if (!term) { this.searchResults.set([]); return; }

    const matches = this.allForSearch.filter(a => {
      const title  = (a.booking?.listing?.title || '').toLowerCase();
      const city   = (a.booking?.listing?.city  || '').toLowerCase();
      const status = (a.status || '').toLowerCase().replace('_', ' ');
      const type   = (a.type === 'return' ? 'return' : 'delivery');
      const owner  = (a.booking?.owner?.name || '').toLowerCase();
      return title.includes(term) || city.includes(term)
        || status.includes(term) || type.includes(term) || owner.includes(term);
    });
    this.searchResults.set(matches.slice(0, 6));
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
  }

  private loadEarnings(): void {
    this.loadingEarnings.set(true);
    this.rider.getEarnings().subscribe({
      next: (res) => {
        this.earnings.set(res?.data || null);
        // The earnings endpoint already reports isAvailable — use it to seed
        // the On Duty toggle's initial state without a second round-trip.
        if (res?.data?.isAvailable != null) this.available.set(res.data.isAvailable);
        this.loadingEarnings.set(false);
        this.scheduleChartDraw();
      },
      error: () => { this.earnings.set(null); this.loadingEarnings.set(false); },
    });
  }

  // Charts live behind *ngIf blocks that only render once earnings() resolves.
  // A single setTimeout can fire before Angular has flushed those DOM nodes,
  // leaving blank canvases. So we retry a few times until the canvas refs
  // actually exist, then draw.
  private chartDrawAttempts = 0;
  private scheduleChartDraw(): void {
    this.chartDrawAttempts = 0;
    const tick = () => {
      this.chartDrawAttempts++;
      const ready = this.viewReady && this.earnings() && typeof Chart !== 'undefined'
        && (this.trendChartRef?.nativeElement || this.deliveryBarRef?.nativeElement || this.completionRingRef?.nativeElement);
      if (ready) {
        this.tryDrawCharts();
        return;
      }
      if (this.chartDrawAttempts < 12) setTimeout(tick, 120);
    };
    setTimeout(tick, 80);
  }

  private loadReferral(): void {
    this.loadingReferral.set(true);
    this.auth.getReferralInfo().subscribe({
      next: (res) => { this.referral.set(res?.data || null); this.loadingReferral.set(false); },
      error: () => { this.referral.set(null); this.loadingReferral.set(false); },
    });
  }

  copyReferralCode(): void {
    const code = this.referral()?.referralCode;
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      this.copiedReferral.set(true);
      setTimeout(() => this.copiedReferral.set(false), 2500);
    }).catch(() => {
      this.snack.open('Copy nahi hua — manually copy karein.', 'OK', { duration: 3000 });
    });
  }

  // ── Charts (real data only — weeklyTrend/statusBreakdown come straight
  //    from getEarnings(), nothing here is invented client-side) ───────────
  private tryDrawCharts(): void {
    if (!this.viewReady || !this.earnings() || typeof Chart === 'undefined') return;
    this.drawTrendChart();
    this.drawStatusChart();
    this.drawDeliveryBarChart();
    this.drawCompletionRing();
    this.drawAcceptChart();
  }

  get hasTrendData(): boolean {
    const t = this.earnings()?.weeklyTrend || [];
    return t.some((d: any) => d.amount > 0);
  }

  /** Latest 5 orders for the dashboard side panel. */
  get recentOrders(): any[] {
    return this.recentAssignments();
  }

  get hasStatusData(): boolean {
    const s = this.earnings()?.statusBreakdown;
    if (!s) return false;
    return Object.values(s).some((v: any) => v > 0);
  }

  get hasDeliveryCountData(): boolean {
    const t = this.earnings()?.weeklyTrend || [];
    return t.some((d: any) => (d.count || 0) > 0);
  }

  get hasAcceptData(): boolean {
    const s = this.earnings()?.statusBreakdown;
    if (!s) return false;
    const accepted = (s.accepted || 0) + (s.picked_up || 0) + (s.delivered || 0) + (s.completed || 0);
    return accepted > 0 || (s.declined || 0) > 0;
  }

  private drawTrendChart(): void {
    const canvas = this.trendChartRef?.nativeElement;
    if (!canvas || !this.hasTrendData) return;
    this.trendChartInst?.destroy();

    const trend = this.earnings().weeklyTrend as { date: string; amount: number }[];
    const labels = trend.map(d => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString('en-PK', { weekday: 'short' });
    });
    const values = trend.map(d => d.amount);

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 180);
    grad.addColorStop(0, 'rgba(31,84,53,0.35)');
    grad.addColorStop(1, 'rgba(31,84,53,0.02)');

    this.trendChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Earnings (Rs)', data: values,
          borderColor: '#1F5435', backgroundColor: grad, fill: true,
          tension: 0.35, borderWidth: 2.5,
          pointBackgroundColor: '#1F5435', pointBorderColor: '#fff', pointBorderWidth: 2,
          pointRadius: 4, pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#eef2ec' }, ticks: { font: { size: 11 }, color: '#6b7280' } },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#6b7280' } },
        },
      },
    });
  }

  private drawStatusChart(): void {
    const canvas = this.statusChartRef?.nativeElement;
    if (!canvas || !this.hasStatusData) return;
    this.statusChartInst?.destroy();

    const s = this.earnings().statusBreakdown;
    const entries = [
      { label: 'Completed', value: s.completed, color: '#1F5435' },
      { label: 'Delivered',  value: s.delivered,  color: '#3b82f6' },
      { label: 'Picked Up',  value: s.picked_up,  color: '#f59e0b' },
      { label: 'Accepted',   value: s.accepted,   color: '#8b5cf6' },
      { label: 'Assigned',   value: s.assigned,   color: '#9ca3af' },
      { label: 'Declined',   value: s.declined,   color: '#f97316' },
      { label: 'Cancelled',  value: s.cancelled,  color: '#ef4444' },
    ].filter(e => e.value > 0);

    this.statusChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e.label),
        datasets: [{
          data: entries.map(e => e.value),
          backgroundColor: entries.map(e => e.color),
          borderWidth: 0, hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 }, color: '#6b7280', usePointStyle: true, pointStyle: 'circle' } },
        },
      },
    });
  }

  // ── Weekly Deliveries Bar Chart ───────────────────────────────────────────
  private drawDeliveryBarChart(): void {
    const canvas = this.deliveryBarRef?.nativeElement;
    if (!canvas) return;
    this.deliveryBarInst?.destroy();

    const trend = this.earnings().weeklyTrend as { date: string; amount: number; count: number }[];
    const labels = trend.map(d => new Date(d.date).toLocaleDateString('en-PK', { weekday: 'short' }));
    const values = trend.map(d => d.count || 0);

    this.deliveryBarInst = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Deliveries',
          data: values,
          backgroundColor: values.map(v => v > 0 ? '#1F5435' : '#EAF3DE'),
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0, font: { size: 11 }, color: '#6b7280' },
            grid: { color: '#eef2ec' },
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#6b7280' } },
        },
      },
    });
  }

  // ── Completion Rate Ring ──────────────────────────────────────────────────
  private drawCompletionRing(): void {
    const canvas = this.completionRingRef?.nativeElement;
    if (!canvas) return;
    this.completionRingInst?.destroy();

    const rate = this.earnings().completionRate ?? 0;
    const remaining = 100 - rate;

    this.completionRingInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [rate, remaining],
          backgroundColor: ['#1F5435', '#EAF3DE'],
          borderWidth: 0,
          hoverOffset: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        animation: { animateRotate: true, duration: 900 },
      },
      plugins: [{
        id: 'centerText',
        afterDraw(chart: any) {
          const { ctx, chartArea: { top, bottom, left, right } } = chart;
          const cx = (left + right) / 2;
          const cy = (top + bottom) / 2;
          ctx.save();
          ctx.font = 'bold 22px Poppins, Inter, sans-serif';
          ctx.fillStyle = '#111827';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(rate + '%', cx, cy - 8);
          ctx.font = '11px Poppins, Inter, sans-serif';
          ctx.fillStyle = '#6b7280';
          ctx.fillText('completion', cx, cy + 12);
          ctx.restore();
        },
      }],
    });
  }

  // ── Acceptance vs Decline Rate ────────────────────────────────────────────
  private drawAcceptChart(): void {
    const canvas = this.acceptChartRef?.nativeElement;
    if (!canvas || !this.hasAcceptData) return;
    this.acceptChartInst?.destroy();

    const s = this.earnings().statusBreakdown;
    const accepted = (s.accepted || 0) + (s.picked_up || 0) + (s.delivered || 0) + (s.completed || 0);
    const declined = s.declined || 0;

    this.acceptChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Accepted', 'Declined'],
        datasets: [{
          data: [accepted, declined],
          backgroundColor: ['#1F5435', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 14, font: { size: 11 }, color: '#6b7280', usePointStyle: true, pointStyle: 'circle' },
          },
        },
        animation: { animateRotate: true, duration: 900 },
      },
      plugins: [{
        id: 'centerAccept',
        afterDraw(chart: any) {
          const { ctx, chartArea: { top, bottom, left, right } } = chart;
          const total = accepted + declined;
          if (total === 0) return;
          const pct = Math.round((accepted / total) * 100);
          const cx = (left + right) / 2;
          const cy = (top + bottom) / 2;
          ctx.save();
          ctx.font = 'bold 20px Poppins, Inter, sans-serif';
          ctx.fillStyle = '#1F5435';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pct + '%', cx, cy - 6);
          ctx.font = '10px Poppins, Inter, sans-serif';
          ctx.fillStyle = '#6b7280';
          ctx.fillText('accepted', cx, cy + 10);
          ctx.restore();
        },
      }],
    });
  }

  setFilter(f: 'active' | 'completed'): void {
    if (this.filter() === f) return;
    this.filter.set(f);
    this.load();
  }

  toggleAvailability(): void {
    if (this.savingAvail()) return;
    const next = !this.available();
    this.savingAvail.set(true);
    this.rider.setAvailability(next).subscribe({
      next: (res) => {
        const isNow = res?.data?.isAvailable ?? next;
        this.available.set(isNow);
        this.savingAvail.set(false);
        if (isNow) {
          this.startLocationTracking();
          this.snack.open('On Duty — GPS tracking shuru', 'OK', { duration: 2500 });
        } else {
          this.stopLocationTracking();
          this.snack.open('Off Duty — GPS band', 'OK', { duration: 2500 });
        }
      },
      error: (err) => { this.savingAvail.set(false); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  accept(a: any): void {
    this.busyId.set(a._id);
    this.rider.accept(a._id).subscribe({
      next: () => { this.busyId.set(null); this.snack.open('Assignment accepted.', 'OK', { duration: 3000 }); this.load(); },
      error: (err) => { this.busyId.set(null); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  decline(a: any): void {
    this.decliningId.set(a._id);
    this.rider.decline(a._id).subscribe({
      next: () => {
        this.decliningId.set(null);
        this.snack.open('Assignment declined — reassigning to another rider.', 'OK', { duration: 3500 });
        this.load();
        this.loadEarnings(); // acceptanceRate changes immediately on decline
      },
      error: (err) => { this.decliningId.set(null); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  deliver(a: any): void {
    // Delivery requires evidence — go to scan/evidence flow (reuse scan page with assignment)
    this.router.navigate(['/rider/scan'], { queryParams: { assignment: a._id, action: 'deliver' } });
  }

  complete(a: any): void {
    this.busyId.set(a._id);
    this.rider.complete(a._id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.snack.open('Delivery completed!', 'OK', { duration: 3000 });
        this.load();
        this.loadEarnings(); // refreshes totals + both charts with the new real data
      },
      error: (err) => { this.busyId.set(null); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  goScan(): void { this.router.navigate(['/rider/scan']); }
  goScanFor(a: any): void { this.router.navigate(['/rider/scan'], { queryParams: { assignment: a._id, action: 'pickup' } }); }

  startLocationTracking(): void {
    if (!navigator.geolocation) return;
    this.stopLocationTracking();
    const send = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.socket.emitRiderLocation(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => { console.warn('[GPS]', err.message); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
      );
    };
    send();
    this.locationInterval = setInterval(send, 5000);
  }

  stopLocationTracking(): void {
    if (this.locationInterval) {
      clearInterval(this.locationInterval);
      this.locationInterval = null;
    }
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      assigned: 'Assigned', accepted: 'Accepted', declined: 'Declined', picked_up: 'Picked Up',
      delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
    };
    return map[s] || s;
  }

  vehicleEmoji(v: string): string {
    const map: Record<string, string> = { bike: '🛵', car: '🚗', van: '🚐' };
    return map[v] || '🛵';
  }

  /** QR image URL — global encodeURIComponent yahan method ke through use hoti hai */
  qrImageUrl(code: string): string {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&ecc=M&data=' + encodeURIComponent(code);
  }

  /** QR code copy karo clipboard mein */
  copyCode(a: any): void {
    const code = a.qrCode;
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      this.copiedId.set(a._id);
      setTimeout(() => this.copiedId.set(null), 2500);
    }).catch(() => {
      this.snack.open('Copy nahi hua — manually copy karein.', 'OK', { duration: 3000 });
    });
  }
}
