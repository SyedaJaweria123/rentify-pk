// src/app/admin/pages/analytics/analytics.component.ts
/**
 * Admin · Analytics — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 *  • User Growth LINE chart (new users per month, last 12 months)
 *  • Category Popularity BAR chart (listings per category)
 *  • Top 5 Cities by listings (bars)
 *  • Top 10 Owners by earnings (table)
 *  APIs: /charts/users, /charts/categories, /analytics
 *  Chart.js loaded via CDN (declare const Chart).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AdminService } from '../../services/admin.service';

declare const Chart: any;

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css'],
})
export class AdminAnalyticsComponent implements OnInit, AfterViewInit {
  @ViewChild('usersCanvas')    usersCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryCanvas') categoryCanvas!: ElementRef<HTMLCanvasElement>;

  topCities = signal<any[]>([]);
  topOwners = signal<any[]>([]);
  loading   = signal(true);

  private viewReady = false;
  private userData:  { labels: string[]; values: number[] } | null = null;
  private catData:   { labels: string[]; values: number[] } | null = null;
  private uChart: any = null;
  private cChart: any = null;

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void {
    // Charts data
    this.adminSvc.getUserGrowthChart().subscribe({
      next: (res: any) => { this.userData = res.data; this.drawUsers(); },
    });
    this.adminSvc.getCategoryChart().subscribe({
      next: (res: any) => { this.catData = res.data; this.drawCategory(); },
    });
    // Tables
    this.adminSvc.getAnalytics().subscribe({
      next: (res: any) => {
        this.topCities.set(res.data?.topCities || []);
        this.topOwners.set(res.data?.topOwners || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.drawUsers();
    this.drawCategory();
  }

  // Max city listings — for relative bar widths
  maxCity(): number {
    return Math.max(1, ...this.topCities().map(c => c.listings || 0));
  }
  cityPct(c: any): number { return Math.round(((c.listings || 0) / this.maxCity()) * 100); }

  private drawUsers(): void {
    if (!this.viewReady || !this.usersCanvas || !this.userData || typeof Chart === 'undefined') return;
    if (this.uChart) this.uChart.destroy();
    this.uChart = new Chart(this.usersCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: this.userData.labels,
        datasets: [{
          label: 'New Users', data: this.userData.values,
          borderColor: '#1F5435', backgroundColor: 'rgba(0,166,81,.12)',
          fill: true, tension: .35, pointRadius: 3,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } },
    });
  }

  private drawCategory(): void {
    if (!this.viewReady || !this.categoryCanvas || !this.catData || typeof Chart === 'undefined') return;
    if (this.cChart) this.cChart.destroy();
    this.cChart = new Chart(this.categoryCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.catData.labels,
        datasets: [{
          label: 'Listings', data: this.catData.values,
          backgroundColor: '#6366F1', borderRadius: 6, maxBarThickness: 36,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } },
    });
  }
}
