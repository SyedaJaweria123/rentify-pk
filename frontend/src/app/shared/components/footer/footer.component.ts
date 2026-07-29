/**
 * FooterComponent — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-world footer structure: Brand | Company | Categories | Support |
 * Contact, a trust-indicators strip, a working newsletter signup (now
 * actually saved via POST /api/newsletter/subscribe — previously this just
 * faked a success message client-side with a TODO comment), and a
 * back-to-top control.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { PublicSettingsService } from '../../../core/services/public-settings.service';

@Component({
  selector:    'app-footer',
  standalone:  true,
  imports:     [CommonModule, RouterModule, FormsModule],
  templateUrl: './footer.component.html',
  styleUrls:   ['./footer.component.css'],
})
export class FooterComponent {

  /** Current year for copyright notice */
  currentYear = new Date().getFullYear();

  constructor(
    private http: HttpClient,
    public  settings: PublicSettingsService, // public: template reads settings.contactEmail() directly
  ) {
    // The footer renders on every page, not just the home page — make sure
    // real settings (contact email, site name) load even on pages that
    // don't already call settings.load() themselves.
    if (!this.settings.loaded()) this.settings.load();
  }

  // ── Newsletter subscription form state ────────────────────────────────────
  email       = '';
  emailError  = '';
  subscribed  = false;
  subscribing = false;

  // ── Footer navigation links ───────────────────────────────────────────────

  /** Company/account links column */
  readonly companyLinks = [
    { label: 'About Us',      path: '/about' },
    { label: 'How It Works',  path: '/how-it-works' },
    { label: 'Become an Owner', path: '/become-owner' },
    { label: 'Careers',       path: '/careers' },
    { label: 'Blog',          path: '/blog' },
    { label: 'Press',         path: '/press' },
  ];

  /** Browse by category links */
  readonly categoryLinks = [
    { icon: 'electronics', label: 'Electronics',       value: 'Electronics' },
    { icon: 'vehicles',    label: 'Vehicles',          value: 'Vehicles' },
    { icon: 'camera',      label: 'Cameras',           value: 'Photography & Video' },
    { icon: 'tools',       label: 'Tools',             value: 'Tools & Equipment' },
    { icon: 'furniture',   label: 'Furniture',         value: 'Furniture' },
    { icon: 'sports',      label: 'Sports',            value: 'Sports & Outdoors' },
  ];

  /** Support links column */
  readonly supportLinks = [
    { label: 'Help Center',   path: '/help' },
    { label: 'Contact Us',    path: '/contact' },
    { label: 'File a Dispute', path: '/dispute/new' },
    { label: 'Safety Tips',   path: '/safety' },
    { label: 'Trust & Safety', path: '/trust' },
  ];

  /** Legal links in footer bottom */
  readonly legalLinks = [
    { label: 'Privacy Policy',    path: '/privacy' },
    { label: 'Terms of Service',  path: '/terms' },
    { label: 'Cookie Policy',     path: '/cookies' },
  ];

  /** Social media links */
  readonly socialLinks = [
    { icon: 'facebook',  label: 'Facebook',  url: 'https://www.facebook.com/' },
    { icon: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/' },
    { icon: 'twitter',   label: 'Twitter',   url: 'https://twitter.com/' },
    { icon: 'youtube',   label: 'YouTube',   url: 'https://www.youtube.com/' },
  ];

  /** Trust indicators strip — same real platform features highlighted
   *  elsewhere (hero trust row), repeated here since footers are a common
   *  place people look to double-check a site is legitimate. */
  readonly trustPoints = [
    { icon: 'verified', label: 'CNIC Verified Owners' },
    { icon: 'secure',   label: 'Secure Escrow Payments' },
    { icon: 'support',  label: '24/7 Customer Support' },
  ];

  // ── Newsletter subscription (real backend, no more fake success) ─────────

  private validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  subscribe(): void {
    this.emailError = '';

    if (!this.email.trim()) {
      this.emailError = 'Please enter your email address.';
      return;
    }
    if (!this.validateEmail(this.email)) {
      this.emailError = 'Please enter a valid email address.';
      return;
    }

    this.subscribing = true;
    this.http.post<any>(`${environment.apiUrl}/newsletter/subscribe`, { email: this.email.trim(), source: 'footer' })
      .subscribe({
        next: () => {
          this.subscribing = false;
          this.subscribed   = true;
          this.email        = '';
        },
        error: (err) => {
          this.subscribing = false;
          this.emailError   = err.error?.message || 'Something went wrong. Please try again.';
        },
      });
  }

  /** Smooth-scrolls back to the top of the page. */
  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
