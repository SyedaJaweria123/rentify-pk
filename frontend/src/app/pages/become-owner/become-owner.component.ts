import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { CmsService, OwnerStory } from '../../services/cms.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-become-owner',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DecimalPipe],
  templateUrl: './become-owner.component.html',
  styleUrls: ['./become-owner.component.css'],
})
export class BecomeOwnerComponent implements OnInit, OnDestroy {

  /* ── Real owner success stories from GET /api/cms/owner-stories ── */
  ownerStories:  OwnerStory[] = [];
  storiesLoading = true;

  /* ── Benefits (icon = SVG key) ── */
  readonly benefits = [
    { icon: 'income',  title: 'Earn Passive Income', desc: 'Turn items you rarely use into a steady income. No boss, no schedule — rent on your terms.' },
    { icon: 'lock',    title: 'Secure Payments',     desc: "All payments go through Rentify's secure wallet. Funds are released only after safe handover." },
    { icon: 'verified',title: 'Verified Renters',    desc: 'Renters must have a verified account before they can book your item.' },
    { icon: 'shield',  title: 'Damage Protection',   desc: 'Set a security deposit. If anything gets damaged, file a dispute and get compensated.' },
    { icon: 'phone',   title: 'Easy Management',     desc: 'Manage listings, bookings, and earnings from your phone or desktop — available 24/7.' },
    { icon: 'chart',   title: 'Insights & Analytics',desc: "Track views, bookings, and earnings with your owner dashboard. Know what's working." },
  ];

  /* ── Steps ── */
  readonly steps = [
    { num: '01', icon: 'edit',   title: 'Create Your Listing', desc: 'Add photos, set your price, describe your item — it takes just a few minutes.' },
    { num: '02', icon: 'id',     title: 'Verify Your CNIC',    desc: 'One-time CNIC verification unlocks all owner features and builds renter trust.' },
    { num: '03', icon: 'live',   title: 'Go Live',             desc: 'Your listing becomes visible to renters across Pakistan immediately.' },
    { num: '04', icon: 'check',  title: 'Accept Bookings',     desc: 'Review renter profiles and accept or decline requests with one tap.' },
    { num: '05', icon: 'wallet', title: 'Get Paid',            desc: 'Earnings hit your wallet after each completed rental. Withdraw anytime.' },
  ];

  /* ── Earnings Calculator (illustrative estimate, user-driven) ── */
  calcCategory     = 'Car';
  calcDaysPerMonth = 10;
  calcPricePerDay  = 4000;

  readonly categoryPresets: Record<string, { price: number; label: string }> = {
    'Car':       { price: 4000, label: 'Car' },
    'Camera':    { price: 2500, label: 'Camera' },
    'Laptop':    { price: 2000, label: 'Laptop' },
    'Projector': { price: 1500, label: 'Projector' },
    'Generator': { price: 3500, label: 'Generator' },
    'Tent':      { price: 1200, label: 'Tent' },
    'Furniture': { price: 800,  label: 'Furniture' },
    'Bike':      { price: 1500, label: 'Bike' },
  };
  get categoryKeys(): string[] { return Object.keys(this.categoryPresets); }
  onCategoryChange(): void { this.calcPricePerDay = this.categoryPresets[this.calcCategory]?.price || 1000; }

  get grossEarning():  number { return this.calcDaysPerMonth * this.calcPricePerDay; }
  get platformFee():   number { return Math.round(this.grossEarning * 0.05); }
  get netEarning():    number { return this.grossEarning - this.platformFee; }
  get yearlyEarning(): number { return this.netEarning * 12; }

  private destroy$ = new Subject<void>();
  constructor(private cms: CmsService, public auth: AuthService, private router: Router) {}

  // ── Upgrade-to-owner form (shown to logged-in renters) ──────────────────────
  upgPhone = '';
  upgCnic  = '';
  upgLoading = false;
  upgError = '';
  upgSuccess = false;

  get isLoggedIn(): boolean { return this.auth.isLoggedIn; }
  // Both renters AND riders can become owners — they rent items just like
  // renters do, so giving them the owner upgrade path is natural. The backend
  // upgrade-to-owner endpoint already allows any non-owner role.
  get isRenter(): boolean {
    const role = String(this.auth.currentUser?.role || '');
    return this.isLoggedIn && (role === 'renter' || role === 'rider');
  }
  get isAlreadyOwner(): boolean {
    return this.isLoggedIn && String(this.auth.currentUser?.role || '') === 'owner';
  }

  submitUpgrade(): void {
    this.upgError = '';
    const phone = this.upgPhone.trim();
    const cnic = this.upgCnic.trim();

    if (!/^03\d{9}$/.test(phone)) {
      this.upgError = 'Enter a valid Pakistani phone (03XXXXXXXXX).';
      return;
    }
    if (!/^\d{5}-\d{7}-\d$/.test(cnic)) {
      this.upgError = 'Enter a valid CNIC (42101-1234567-1).';
      return;
    }

    this.upgLoading = true;
    this.auth.upgradeToOwner({ phone, cnicNumber: cnic })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.upgLoading = false;
          this.upgSuccess = true;
          // Refresh session so the new role takes effect, then send to dashboard.
          setTimeout(() => this.router.navigate(['/dashboard']), 1800);
        },
        error: (err) => {
          this.upgLoading = false;
          this.upgError = err?.error?.errors?.[0]?.message
            || err?.error?.message
            || 'Upgrade failed. Please check your details and try again.';
        },
      });
  }

  ngOnInit(): void {
    this.cms.getOwnerStories(3)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => { this.ownerStories = data || []; this.storiesLoading = false; },
        error: () => { this.storiesLoading = false; },
      });
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
