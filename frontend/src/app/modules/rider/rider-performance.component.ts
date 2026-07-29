import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RiderService } from './rider.service';

declare const Chart: any;

@Component({
  selector: 'app-rider-performance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rider-performance.component.html',
  styleUrls: ['./rider-performance.component.css'],
})
export class RiderPerformanceComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;

  loading = signal(true);
  earnings = signal<any | null>(null);

  private statusChartInst: any = null;
  private viewReady = false;

  constructor(private rider: RiderService) {}

  ngOnInit(): void { this.load(); }
  ngAfterViewInit(): void { this.viewReady = true; this.tryDrawChart(); }
  ngOnDestroy(): void { this.statusChartInst?.destroy(); }

  load(): void {
    this.loading.set(true);
    this.rider.getEarnings().subscribe({
      next: (res) => {
        this.earnings.set(res?.data || null);
        this.loading.set(false);
        setTimeout(() => this.tryDrawChart(), 50);
      },
      error: () => { this.earnings.set(null); this.loading.set(false); },
    });
  }

  get hasStatusData(): boolean {
    const s = this.earnings()?.statusBreakdown;
    if (!s) return false;
    return Object.values(s).some((v: any) => v > 0);
  }

  private tryDrawChart(): void {
    if (!this.viewReady || !this.earnings() || typeof Chart === 'undefined') return;
    this.drawStatusChart();
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
}
