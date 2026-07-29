import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RiderService } from './rider.service';

declare const Chart: any;

@Component({
  selector: 'app-rider-earnings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './rider-earnings.component.html',
  styleUrls: ['./rider-earnings.component.css'],
})
export class RiderEarningsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('typeChart') typeChartRef!: ElementRef<HTMLCanvasElement>;

  loading = signal(true);
  earnings = signal<any | null>(null);

  private trendChartInst: any = null;
  private typeChartInst: any = null;
  private viewReady = false;

  constructor(private rider: RiderService) {}

  ngOnInit(): void { this.load(); }
  ngAfterViewInit(): void { this.viewReady = true; this.tryDrawCharts(); }
  ngOnDestroy(): void { this.trendChartInst?.destroy(); this.typeChartInst?.destroy(); }

  load(): void {
    this.loading.set(true);
    this.rider.getEarnings().subscribe({
      next: (res) => {
        this.earnings.set(res?.data || null);
        this.loading.set(false);
        setTimeout(() => this.tryDrawCharts(), 50);
      },
      error: () => { this.earnings.set(null); this.loading.set(false); },
    });
  }

  get hasTrendData(): boolean {
    const t = this.earnings()?.weeklyTrend || [];
    return t.some((d: any) => d.amount > 0);
  }

  get hasTypeData(): boolean {
    const t = this.earnings()?.typeBreakdown;
    if (!t) return false;
    return (t.delivery || 0) > 0 || (t.return || 0) > 0;
  }

  private tryDrawCharts(): void {
    if (!this.viewReady || !this.earnings() || typeof Chart === 'undefined') return;
    this.drawTrendChart();
    this.drawTypeChart();
  }

  private drawTrendChart(): void {
    const canvas = this.trendChartRef?.nativeElement;
    if (!canvas || !this.hasTrendData) return;
    this.trendChartInst?.destroy();

    const trend = this.earnings().weeklyTrend as { date: string; amount: number }[];
    const labels = trend.map(d => new Date(d.date).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' }));
    const values = trend.map(d => d.amount);

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
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

  private drawTypeChart(): void {
    const canvas = this.typeChartRef?.nativeElement;
    if (!canvas || !this.hasTypeData) return;
    this.typeChartInst?.destroy();

    const t = this.earnings().typeBreakdown;
    this.typeChartInst = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Delivery', 'Return'],
        datasets: [{
          data: [t.delivery || 0, t.return || 0],
          backgroundColor: ['#1F5435', '#8b5cf6'],
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
