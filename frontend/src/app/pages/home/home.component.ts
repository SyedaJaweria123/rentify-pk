// ─────────────────────────────────────────────────────────────────────────
// Home Page Component — Rentify PK
//
// Renders the public landing page: hero, category chips, "How It Works",
// "Why Choose Rentify" (with click-to-expand feature popups), the
// "Become a Host" banner, recent reviews, and the final CTA.
//
// Also owns two scroll-driven animation behaviours (see ngAfterViewInit):
//   1. Fade/slide-in reveal for sections as the user scrolls past them.
//   2. A "count up from 0" animation for the real platform stats, so the
//      numbers feel alive instead of just appearing instantly.
// ─────────────────────────────────────────────────────────────────────────
import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../modules/wishlist/wishlist.service';
import { PublicSettingsService } from '../../core/services/public-settings.service';
import { CITY_NAMES } from '../../models/pakistan-locations';
import { environment } from '../../../environments/environment';
import { WorkListingsComponent } from '../../shared/components/work-listings.component';
import { WhyChooseComponent } from '../../shared/components/why-choose.component';

declare const Swiper: any;

/** A single review shown in the "What Our Users Say" section. */
interface HomeReview {
  id: string;
  rating: number;
  comment: string;
  reviewerName: string;
  reviewerAvatar: string | null;
  listingTitle: string | null;
}

/** One bullet point inside a feature's detail popup (icon + title + explanation). */
interface PopupPoint { icon: string; title: string; detail: string; }

/**
 * One card in the "Why Choose Rentify" grid. `popup` holds the extra detail
 * shown in the modal that opens when the user clicks "Learn more" on the card.
 */
interface FeatureCard {
  icon: string; title: string; desc: string; highlight: string[];
  popup: { title: string; desc: string; points: PopupPoint[] };
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, WorkListingsComponent, WhyChooseComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {

  // Recent real reviews shown as stacked cards over the hero image.
  reviews: HomeReview[] = [];
  popularListings: any[] = [];
  listingsLoading = true;
  topOwners: any[] = [];
  activeOwner: any = null;

  @ViewChild('plScroller') plScroller!: ElementRef<HTMLElement>;

  // Live values the stats counter animates TOWARDS (see runCounters()).
  // Template reads these instead of settings.stats() directly so the
  // numbers can count up smoothly rather than popping in instantly.
  animatedStats = { activeListings: 0, verifiedOwners: 0, citiesCovered: 0, avgRating: 0 };
  // Guards the counter so it only ever runs once, the first time the
  // stats row scrolls into view (re-triggering on every scroll would be
  // distracting and pointless).
  statsAnimated = false;

  // ── Rotating headline word ("Rent Anything," → "Rent Furniture," → …) ──
  readonly rotatingWords = ['Anything', 'Furniture', 'Electronics', 'Vehicles', 'Cameras', 'Tools'];
  wordIndex = 0;
  wordVisible = true;
  private wordTimer: any = null;

  // ── Hero search bar (category + city, navigates to /listings pre-filtered) ──
  // Full real category list (matches LISTING_CATEGORIES exactly, including
  // "Other"). Rendered as a custom dropdown (not a native <select>) so each
  // option can carry a real SVG icon — native <option> elements can only
  // ever show plain text, which is why neither plain labels nor emoji ever
  // looked right there.
  readonly searchCategories = [
    { icon: 'electronics', label: 'Electronics',            value: 'Electronics' },
    { icon: 'vehicles',    label: 'Vehicles',                value: 'Vehicles' },
    { icon: 'furniture',   label: 'Furniture',               value: 'Furniture' },
    { icon: 'tools',       label: 'Tools & Equipment',       value: 'Tools & Equipment' },
    { icon: 'sports',      label: 'Sports & Outdoors',       value: 'Sports & Outdoors' },
    { icon: 'clothing',    label: 'Clothing & Accessories',  value: 'Clothing & Accessories' },
    { icon: 'books',       label: 'Books & Media',           value: 'Books & Media' },
    { icon: 'appliances',  label: 'Home Appliances',         value: 'Home Appliances' },
    { icon: 'music',       label: 'Musical Instruments',     value: 'Musical Instruments' },
    { icon: 'camera',      label: 'Photography & Video',     value: 'Photography & Video' },
    { icon: 'party',       label: 'Party & Events',          value: 'Party & Events' },
    { icon: 'baby',        label: 'Baby & Kids',             value: 'Baby & Kids' },
    { icon: 'gaming',      label: 'Gaming',                  value: 'Gaming' },
    { icon: 'travel',      label: 'Travel & Luggage',        value: 'Travel & Luggage' },
    { icon: 'other',       label: 'Other',                   value: 'Other' },
  ];
  readonly cityNames = CITY_NAMES;

  // Custom dropdown open/close state (two independent dropdowns)
  categoryDropdownOpen = false;
  cityDropdownOpen = false;
  citySearch = '';

  get filteredCityNames(): string[] {
    if (!this.citySearch.trim()) return this.cityNames;
    const q = this.citySearch.trim().toLowerCase();
    return this.cityNames.filter(c => c.toLowerCase().includes(q));
  }

  get selectedCategoryLabel(): string {
    const found = this.searchCategories.find(c => c.value === this.heroCategory);
    return found ? found.label : 'Any category';
  }

  get selectedCategoryIconKey(): string {
    const found = this.searchCategories.find(c => c.value === this.heroCategory);
    return found ? found.icon : 'any';
  }

  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen = !this.categoryDropdownOpen;
    if (this.categoryDropdownOpen) this.cityDropdownOpen = false;
  }
  toggleCityDropdown(): void {
    this.cityDropdownOpen = !this.cityDropdownOpen;
    if (this.cityDropdownOpen) { this.categoryDropdownOpen = false; this.citySearch = ''; }
  }
  selectCategory(value: string): void { this.heroCategory = value; this.categoryDropdownOpen = false; }
  selectCity(value: string): void { this.heroCity = value; this.cityDropdownOpen = false; }
  closeHeroDropdowns(): void { this.categoryDropdownOpen = false; this.cityDropdownOpen = false; }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.hero-search')) this.closeHeroDropdowns();
  }
  heroCategory = '';
  heroCity = '';

  searchFromHero(): void {
    this.router.navigate(['/listings'], {
      queryParams: { category: this.heroCategory || null, city: this.heroCity || null },
    });
  }

  // ── "Why Choose Rentify" feature cards ─────────────────────────────────
  // Each card shows a short teaser (icon/title/desc) on the grid, and a
  // richer `popup` (title/desc/points) when the user clicks "Learn more".
  readonly features: FeatureCard[] = [
    {
      icon: 'verified', title: 'Verified Owners',
      desc: 'Every owner is CNIC verified for your safety and peace of mind.',
      highlight: ['CNIC verified'],
      popup: {
        title: 'Verified Owners',
        desc: 'Every owner is CNIC verified for your safety and peace of mind.',
        points: [
          { icon: 'id',      title: 'CNIC Verified',     detail: 'All owners are verified through their CNIC for your security.' },
          { icon: 'shield',  title: 'Trusted Listings',  detail: 'Only verified owners can list items on Rentify.' },
          { icon: 'people',  title: 'Safe & Reliable',   detail: 'We ensure a safe and reliable rental experience for everyone.' },
        ],
      },
    },
    {
      icon: 'price', title: 'Best Prices',
      desc: 'Save up to 80% vs buying. Rent what you need at the best prices.',
      highlight: ['80%'],
      popup: {
        title: 'Best Prices',
        desc: 'Save significantly by renting instead of buying.',
        points: [
          { icon: 'money',   title: 'Up to 80% Savings',     detail: 'Renting costs a fraction of buying — great for occasional use.' },
          { icon: 'compare', title: 'Transparent Pricing',   detail: 'No hidden charges. See full cost before you book.' },
          { icon: 'wallet',  title: 'Flexible Durations',    detail: 'Rent for a day, week, or month — you choose the period.' },
        ],
      },
    },
    {
      icon: 'secure', title: 'Secure Payments',
      desc: 'Wallet system with full transaction history for complete transparency.',
      highlight: ['full transaction history'],
      popup: {
        title: 'Secure Payments',
        desc: 'Your money is safe at every step of the rental journey.',
        points: [
          { icon: 'lock',    title: 'Escrow Protection',  detail: 'Funds are held securely until the item is delivered.' },
          { icon: 'history', title: 'Full History',       detail: 'Every transaction is logged and visible in your wallet.' },
          { icon: 'refund',  title: 'Easy Refunds',       detail: 'Get your money back quickly if something goes wrong.' },
        ],
      },
    },
    {
      icon: 'star', title: 'Trusted Reviews',
      desc: 'Honest reviews from real renters and verified owners.',
      highlight: ['real renters', 'verified owners'],
      popup: {
        title: 'Trusted Reviews',
        desc: 'Every review comes from a verified rental transaction.',
        points: [
          { icon: 'check',   title: 'Verified Only',      detail: 'Only users who completed a booking can leave reviews.' },
          { icon: 'star',    title: 'Two-Way Reviews',    detail: 'Both renters and owners can review each other.' },
          { icon: 'flag',    title: 'Moderated',          detail: 'Suspicious reviews are flagged and removed by our team.' },
        ],
      },
    },
    {
      icon: 'location', title: 'Near You',
      desc: 'Find rentals in your city and area instantly.',
      highlight: ['your city and area'],
      popup: {
        title: 'Near You',
        desc: 'Rentify uses your location to show the nearest available items.',
        points: [
          { icon: 'map',      title: 'City-Based Search',  detail: 'Filter by city, area, or radius from your current location.' },
          { icon: 'rider',    title: 'Doorstep Delivery',  detail: 'Our riders deliver items right to your address.' },
          { icon: 'pin',      title: 'Map View',           detail: 'Browse listings on an interactive map for easy discovery.' },
        ],
      },
    },
    {
      icon: 'support', title: '24/7 Support',
      desc: 'Chat support always available for any issue.',
      highlight: ['always available'],
      popup: {
        title: '24/7 Support',
        desc: 'Our support team is here whenever you need help.',
        points: [
          { icon: 'chat',    title: 'Live Chat',         detail: 'Instant support via in-app chat, any time of day.' },
          { icon: 'ticket',  title: 'Ticket System',     detail: 'Submit support tickets for complex issues with full tracking.' },
          { icon: 'faq',     title: 'Help Center',       detail: 'Browse our FAQ and guides to solve issues on your own.' },
        ],
      },
    },
  ];

  // Which feature's popup is currently open (null = no popup shown).
  activeFeature: FeatureCard | null = null;

  /** Opens the detail popup for a given feature card. */
  openFeaturePopup(f: FeatureCard): void { this.activeFeature = f; }

  /** Closes whichever feature popup is open (via ✕ button or backdrop click). */
  closeFeaturePopup(): void { this.activeFeature = null; }

  // Which review is currently open in the full-text popup (null = closed).
  // Used by both the hero "stacked cards" and the "What Our Users Say" grid —
  // clicking either opens the same modal with that review's full comment.
  activeReview: HomeReview | null = null;

  /** Opens the full-review popup for a given review card. */
  openReviewPopup(r: HomeReview): void { this.activeReview = r; }

  /** Closes the full-review popup (via ✕ button or backdrop click). */
  closeReviewPopup(): void { this.activeReview = null; }

  /** Opens the mini owner-detail popup for a given top-rated owner card. */
  openOwnerPopup(o: any): void { this.activeOwner = o; }

  /** Closes the owner popup (via ✕ button or backdrop click). */
  closeOwnerPopup(): void { this.activeOwner = null; }

  // Small trust badges shown in a couple of places on the page.
  readonly trust = [
    { icon: 'verified', label: 'CNIC Verified Owners' },
    { icon: 'secure',   label: 'Secure Wallet' },
    { icon: 'support',  label: '24/7 Support' },
  ];

  // Keeps references to every IntersectionObserver we create in
  // ngAfterViewInit, so they can all be cleanly disconnected in
  // ngOnDestroy (avoids leaking observers if the user navigates away).
  private observers: IntersectionObserver[] = [];

  constructor(
    public  auth    : AuthService,              // public: template reads auth.isLoggedIn for the wishlist heart
    private router  : Router,
    public  settings: PublicSettingsService,   // public: template reads settings.stats() directly
    private http    : HttpClient,
    private host    : ElementRef,              // root element, used to scope querySelectorAll for animations
    public  wishlist: WishlistService,          // public: template reads wishlist.isSaved(id) directly
  ) {}

  ngOnInit(): void {
    // Pulls CMS text + live platform stats (active listings, verified
    // owners, cities, average rating) from the backend.
    this.settings.load();
    this.loadReviews();
    this.loadListings();
    this.loadTopOwners();
  }

  ngAfterViewInit(): void {
    // Scroll-triggered "fade + slide up" reveal for each animated group.
    // Numbers are how much extra bottom margin to treat as "not yet
    // visible" — a higher number makes the element reveal slightly later
    // (closer to fully on-screen) rather than the instant it peeks in.
    this.observeReveal('.hiw-step', 'hiw-step-visible', 100);
    this.observeReveal('.hiw-stat', 'hiw-stat-visible', 80);
    this.observeReveal('.hiw-right', 'hiw-right-visible', 0);
    this.observeReveal('.hiw-head', 'hiw-head-visible', 0);

    // Animates the real stats counting up from 0 once they're on screen.
    this.observeStatsCounter();

    this.startWordRotation();

    if (this.auth.isLoggedIn) {
      this.wishlist.getWishlist().subscribe({ error: () => {} });
    }
  }

  /** Cycles the highlighted headline word every ~2.4s with a quick fade —
   *  skipped entirely for people who prefer reduced motion (word just
   *  stays on "Anything"). */
  private startWordRotation(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.wordTimer = setInterval(() => {
      this.wordVisible = false;
      setTimeout(() => {
        this.wordIndex = (this.wordIndex + 1) % this.rotatingWords.length;
        this.wordVisible = true;
      }, 220);
    }, 2400);
  }

  ngOnDestroy(): void {
    // Stop watching once the component is torn down — IntersectionObserver
    // instances don't get garbage collected on their own otherwise.
    this.observers.forEach(o => o.disconnect());
    if (this.wordTimer) clearInterval(this.wordTimer);
  }

  /**
   * Adds `visibleClass` to every element matching `selector` the moment it
   * scrolls into the viewport, with each one staggered 120ms after the
   * previous (so a row of cards reveals left-to-right rather than all at
   * once). Each element is only ever animated once — `unobserve` ensures
   * scrolling back up and down doesn't replay the animation.
   */
  private observeReveal(selector: string, visibleClass: string, rootMarginPx: number): void {
    const items = this.host.nativeElement.querySelectorAll(selector);
    if (!items.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => e.target.classList.add(visibleClass), i * 120);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: `0px 0px -${rootMarginPx}px 0px` }
    );

    items.forEach((el: Element) => obs.observe(el));
    this.observers.push(obs);
  }

  /**
   * Watches the stats row (".hiw-stats") and fires the count-up animation
   * the first time it's at least 40% visible. Disconnects immediately
   * after firing since the animation only needs to run once.
   */
  private observeStatsCounter(): void {
    const statsEl = this.host.nativeElement.querySelector('.hiw-stats');
    if (!statsEl) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.statsAnimated) {
          this.statsAnimated = true;
          this.runCounters();
          obs.disconnect();
        }
      },
      { threshold: 0.4 }
    );

    obs.observe(statsEl);
    this.observers.push(obs);
  }

  /**
   * Animates `animatedStats` from 0 up to the real values in
   * `settings.stats()` over ~1.4s at 60fps. Runs all four stats in
   * parallel via separate setInterval timers, each clearing itself once
   * it reaches its target.
   */
  private runCounters(): void {
    const st = this.settings.stats();
    if (!st) return; // stats haven't loaded yet — nothing to animate towards

    const targets = {
      activeListings  : st.activeListings,
      verifiedOwners  : st.verifiedOwners,
      citiesCovered   : st.citiesCovered,
      avgRating       : st.avgRating || 0,
    };

    const duration = 1400; // total animation length, ms
    const fps      = 60;
    const steps    = Math.round(duration / (1000 / fps));

    Object.entries(targets).forEach(([key, target]) => {
      let step = 0;
      const inc = target / steps;
      const timer = setInterval(() => {
        step++;
        // Round to 1 decimal so avgRating (e.g. 4.8) animates smoothly
        // instead of jumping in whole-number increments.
        const val = Math.min(Math.round(inc * step * 10) / 10, target);
        (this.animatedStats as any)[key] = key === 'avgRating' ? val : Math.round(val);
        if (step >= steps) clearInterval(timer);
      }, 1000 / fps);
    });
  }

  /** Fetches the 4 most recent reviews for the "What Our Users Say" section. */
  private loadReviews(): void {
    this.http.get<any>(`${environment.apiUrl}/reviews/recent?limit=4`).subscribe({
      next: (res) => { this.reviews = res?.data?.reviews || []; },
      error: () => { this.reviews = []; }, // fail quietly — section just won't render
    });
  }

  /** Real aggregated top-rated-owner data (GET /reviews/top-owners) — no
   *  fake/curated entries; section just doesn't render if this is empty. */
  private loadTopOwners(): void {
    this.http.get<any>(`${environment.apiUrl}/reviews/top-owners?limit=3`).subscribe({
      next: (res) => { this.topOwners = res?.data?.owners || []; },
      error: () => { this.topOwners = []; },
    });
  }

  /** Fetches popular listings for the home page carousel. */
  private loadListings(): void {
    this.listingsLoading = true;
    this.http.get<any>(`${environment.apiUrl}/listings/popular?limit=8`).subscribe({
      next: (res) => {
        this.popularListings = res?.data?.listings || [];
        this.listingsLoading = false;
      },
      error: () => { this.popularListings = []; this.listingsLoading = false; },
    });
  }

  /** Opens a listing's detail page. */
  openListing(id: string): void {
    this.router.navigate(['/listings', id]);
  }

  /** Real wishlist toggle (not decorative) — redirects to login if signed out. */
  toggleWishlist(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn) { this.router.navigate(['/auth/login']); return; }
    this.wishlist.toggle(id).subscribe({ error: () => {} });
  }

  /** Builds a [0..n) array so the template can *ngFor a row of n stars. */
  stars(n: number): number[] {
    return Array(Math.max(0, Math.min(5, Math.round(n)))).fill(0);
  }

  /** First letter of a name, used as a fallback avatar when no photo exists. */
  initial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  /**
   * Defensive decode for review comments. Some old/imported test reviews in
   * the database were saved with literal HTML entities (e.g. "It&#x27;s")
   * instead of the actual character — this decodes common entities back to
   * normal text before display, so stale data doesn't show "&#x27;" raw.
   * New reviews submitted through the app are never encoded in the first
   * place, so this is purely a safety net for legacy data.
   */
  decodeComment(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .replace(/&#x27;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  /** Simple SPA navigation helper used by buttons throughout the template. */
  goTo(path: string): void { this.router.navigate([path]); }
}
