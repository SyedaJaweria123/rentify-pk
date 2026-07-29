// src/app/core/services/public-settings.service.ts
/**
 * PublicSettingsService — Rentify PK
 * Reads PUBLIC platform settings (CMS text, maintenance flag, site name, fee %)
 * AND real platform stats (active listings, verified owners, cities, avg
 * rating — all computed live from the database, never hardcoded) from
 * GET /api/settings/public and caches them in signals so any component
 * (home banner, footer, How It Works section) can use them.
 */
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PlatformStats {
  activeListings: number;
  verifiedOwners: number;
  citiesCovered: number;
  avgRating: number | null;   // null when there are no reviews yet
}

@Injectable({ providedIn: 'root' })
export class PublicSettingsService {
  siteName        = signal('Rentify PK');
  maintenanceMode = signal(false);
  contactEmail    = signal('aptechsyeda@gmail.com');
  serviceFeePercent = signal(5);
  homeBannerText  = signal('');
  aboutPageText   = signal('');
  stats           = signal<PlatformStats | null>(null);
  loaded          = signal(false);

  constructor(private http: HttpClient) {}

  /** Call once at app start (or in components that need CMS text / stats). */
  load(): void {
    this.http.get<any>(`${environment.apiUrl}/settings/public`).subscribe({
      next: (res) => {
        const d = res.data || {};
        this.siteName.set(d.siteName || 'Rentify PK');
        this.maintenanceMode.set(!!d.maintenanceMode);
        this.contactEmail.set(d.contactEmail || 'aptechsyeda@gmail.com');
        this.serviceFeePercent.set(typeof d.serviceFeePercent === 'number' ? d.serviceFeePercent : 5);
        this.homeBannerText.set(d.homeBannerText || '');
        this.aboutPageText.set(d.aboutPageText || '');
        this.stats.set(d.stats || null);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
