// src/app/admin/pages/settings/settings.component.ts
/**
 * Admin · Settings — Rentify PK
 *  Tabs: General · Commission · CMS · Security
 *   - General:    site name, contact email, maintenance toggle
 *   - Commission: platform fee % slider with live preview
 *   - CMS:        homepage banner + about page text
 *   - Security:   force-logout-all button, IP whitelist
 *  APIs: GET/PUT /api/admin/settings, POST /api/admin/force-logout
 *  All settings persist to a real Settings document (no mock data).
 */
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class AdminSettingsComponent implements OnInit {
  activeTab = signal<'general' | 'commission' | 'cms' | 'security'>('general');

  loading = signal(true);
  saving  = signal(false);
  error   = signal('');
  successMsg = signal('');

  // Settings model (loaded from API)
  s: any = {
    siteName: '', contactEmail: '', maintenanceMode: false,
    serviceFeePercent: 5, currency: 'PKR',
    homeBannerText: '', aboutPageText: '', ipWhitelist: [],
  };
  ipInput = '';   // comma-separated IPs for the textarea

  constructor(private adminSvc: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminSvc.getSettings().subscribe({
      next: (res: any) => {
        this.s = { ...this.s, ...(res.data || {}) };
        this.ipInput = (this.s.ipWhitelist || []).join(', ');
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load settings.'); this.loading.set(false); },
    });
  }

  setTab(tab: 'general' | 'commission' | 'cms' | 'security'): void {
    this.activeTab.set(tab);
    this.successMsg.set('');
  }

  // Live preview: what a renter pays in fees on a Rs 1000 booking
  feePreview(): number {
    return Math.round(1000 * (this.s.serviceFeePercent / 100));
  }

  save(): void {
    this.saving.set(true);
    this.successMsg.set('');
    // Parse IP whitelist from the comma/newline separated input
    this.s.ipWhitelist = this.ipInput.split(/[\n,]+/).map((x: string) => x.trim()).filter(Boolean);

    this.adminSvc.updateSettings(this.s).subscribe({
      next: (res: any) => {
        this.successMsg.set(res.message || 'Settings saved');
        this.saving.set(false);
      },
      error: () => { alert('Failed to save settings.'); this.saving.set(false); },
    });
  }

  forceLogout(): void {
    if (!confirm('Force logout ALL users? They will need to log in again.')) return;
    this.adminSvc.forceLogoutAll().subscribe({
      next: (res: any) => alert(res.message || 'All users logged out.'),
      error: () => alert('Failed to force logout.'),
    });
  }
}
