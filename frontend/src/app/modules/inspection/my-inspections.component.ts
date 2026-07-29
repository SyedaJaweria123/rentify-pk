import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { InspectionService } from './inspection.service';
import { AuthService } from '../../services/auth.service';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';
import { RiderLayoutComponent } from '../rider/rider-layout.component';

/**
 * Inspections & Proofs — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Every delivery/return condition report ("proof") across every booking the
 * logged-in account is part of — owner, renter, or rider (riders conduct
 * delivery inspections too) — from the new GET /inspections/my endpoint.
 * Real data only: overall condition, AI scores, and detected issues come
 * straight from InspectionReport / Gemini Vision analysis, nothing invented.
 */
@Component({
  selector: 'app-my-inspections',
  standalone: true,
  imports: [CommonModule, RouterModule, OwnerLayoutComponent, RenterLayoutComponent, RiderLayoutComponent],
  templateUrl: './my-inspections.component.html',
  styleUrls: ['./my-inspections.component.css'],
})
export class MyInspectionsComponent implements OnInit {
  reports: any[] = [];
  pagination: any = null;
  page = 1;
  loading = true;
  error = '';

  typeFilter: 'all' | 'delivery' | 'return' = 'all';
  readonly typeTabs: { label: string; value: 'all' | 'delivery' | 'return' }[] = [
    { label: 'All',      value: 'all' },
    { label: 'Delivery', value: 'delivery' },
    { label: 'Return',   value: 'return' },
  ];

  constructor(
    private inspectionService: InspectionService,
    public  auth: AuthService,
  ) {}

  get isRider(): boolean { return this.auth.currentUser?.role === 'rider'; }
  get isOwner(): boolean { return this.auth.isOwner; }

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.page    = page;
    this.loading = true;
    this.error   = '';
    this.inspectionService.getMyInspections(page, 12).subscribe({
      next: (res: any) => {
        this.reports    = res.data.reports;
        this.pagination = res.data.pagination;
        this.loading    = false;
      },
      error: (err) => {
        this.error   = err.error?.message || 'Failed to load your inspections.';
        this.loading = false;
      },
    });
  }

  get filteredReports(): any[] {
    if (this.typeFilter === 'all') return this.reports;
    return this.reports.filter(r => r.type === this.typeFilter);
  }

  changePage(p: number): void {
    if (!this.pagination || p < 1 || p > this.pagination.totalPages) return;
    this.load(p);
  }

  listingImage(r: any): string {
    return r.booking?.listing?.images?.[0]?.url || '';
  }

  listingTitle(r: any): string {
    return r.booking?.listing?.title || 'Listing';
  }

  conditionTone(condition: string | null): string {
    switch (condition) {
      case 'excellent': return 'cond-excellent';
      case 'good':       return 'cond-good';
      case 'fair':       return 'cond-fair';
      case 'poor':       return 'cond-poor';
      case 'damaged':    return 'cond-damaged';
      default:           return 'cond-pending';
    }
  }

  conditionLabel(condition: string | null): string {
    return condition ? condition.charAt(0).toUpperCase() + condition.slice(1) : 'Analysis Pending';
  }

  hasIssues(r: any): boolean {
    return (r.aiAnalysis?.detectedIssues?.length || 0) > 0;
  }
}
