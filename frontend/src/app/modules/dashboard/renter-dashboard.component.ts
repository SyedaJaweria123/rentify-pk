import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

/**
 * Renter Dashboard — Rentify PK
 * Clean, data-forward renter home with a rider-style hero (title, search,
 * illustration), key metrics, booking-status bars, and recent bookings —
 * all from GET /dashboard/renter.
 */
@Component({
  selector: 'app-renter-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './renter-dashboard.component.html',
  styleUrls: ['./renter-dashboard.component.css'],
})
export class RenterDashboardComponent implements OnInit {
  loading = signal(true);
  data = signal<any | null>(null);
  searchQuery = '';

  constructor(private http: HttpClient, public auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.http.get(`${environment.apiUrl}/dashboard/renter`).subscribe({
      next: (res: any) => { this.data.set(res?.data || null); this.loading.set(false); },
      error: () => { this.data.set(null); this.loading.set(false); },
    });
  }

  get user() { return this.auth.currentUser; }

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning,';
    if (h < 17) return 'Good afternoon,';
    return 'Good evening,';
  }

  get balance(): number       { return this.data()?.wallet?.balance || 0; }
  get totalBookings(): number { return this.data()?.bookings?.total || 0; }
  get completed(): number     { return this.data()?.bookings?.completed || 0; }
  get active(): number        { return this.data()?.bookings?.active || 0; }
  get totalSpent(): number    { return this.data()?.bookings?.totalSpent || 0; }
  get avgRating(): number     { return this.data()?.reviews?.averageRating || 0; }
  get recentBookings(): any[] { return this.data()?.recentBookings || []; }

  get hasStatusData(): boolean {
    const b = this.data()?.bookings;
    return !!b && (b.pending + b.confirmed + b.active + b.completed + b.cancelled) > 0;
  }

  statusRows(): { label: string; count: number; color: string; pct: number }[] {
    const b = this.data()?.bookings;
    if (!b) return [];
    const defs = [
      { key: 'pending',   label: 'Pending',   color: '#E8A33D' },
      { key: 'confirmed', label: 'Confirmed', color: '#3b82f6' },
      { key: 'active',    label: 'Active',    color: '#8b5cf6' },
      { key: 'completed', label: 'Completed', color: '#1F5435' },
      { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
    ];
    const counts = defs.map(d => b[d.key] || 0);
    const max = Math.max(...counts, 1);
    return defs
      .map((d, i) => ({ label: d.label, count: counts[i], color: d.color, pct: (counts[i] / max) * 100 }))
      .filter(r => r.count > 0);
  }

  categoryRows(): { name: string; count: number; pct: number }[] {
    const cats = this.data()?.categoryBreakdown || [];
    if (!cats.length) return [];
    const max = Math.max(...cats.map((c: any) => c.count), 1);
    return cats.map((c: any) => ({ name: c.name, count: c.count, pct: (c.count / max) * 100 }));
  }

  statusClass(s: string): string { return 'st-' + s; }
  statusLabel(s: string): string {
    const map: Record<string, string> = {
      pending: 'Pending', confirmed: 'Confirmed', active: 'Active',
      completed: 'Completed', cancelled: 'Cancelled',
    };
    return map[s] || s;
  }

  navigate(path: string): void { this.router.navigateByUrl(path); }

  doSearch(): void {
    const q = this.searchQuery.trim();
    if (q) {
      this.router.navigate(['/listings'], { queryParams: { search: q } });
    } else {
      this.router.navigateByUrl('/listings');
    }
  }
}
