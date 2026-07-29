import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { ListingService } from '../../services/listing.service';
import { AuthService }    from '../../services/auth.service';
import { WishlistService } from '../../modules/wishlist/wishlist.service';
import {
  Listing, ListingFilters, ListingPagination, CategoryCount,
  PRICE_UNIT_LABELS, ListingOwner,
} from '../../models/listing.model';
import { CITY_NAMES } from '../../models/pakistan-locations';
import { TrustBadgeComponent } from '../../shared/components/trust-badge/trust-badge.component';
import { ListingsMapComponent } from '../../shared/components/listings-map/listings-map.component';

@Component({
  selector: 'app-browse-listings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DecimalPipe, SlicePipe, TrustBadgeComponent, ListingsMapComponent],
  templateUrl: './browse-listings.component.html',
  styleUrls:  ['./browse-listings.component.css'],
})
export class BrowseListingsComponent implements OnInit, OnDestroy {
  listings:   Listing[]         = [];
  categories: CategoryCount[]   = [];
  pagination: ListingPagination = { total: 0, page: 1, limit: 12, totalPages: 0, hasNext: false, hasPrev: false };

  // All Pakistan cities for dropdown
  cityNames = CITY_NAMES;

  filters: ListingFilters = {
    search: '', category: '', city: '', sortBy: 'createdAt', order: 'desc', page: 1, limit: 12,
  };

  minPriceInput?: number;
  maxPriceInput?: number;

  loading   = true;
  error     = '';
  skeletons = Array(8).fill(0);

  // Map view
  viewMode: 'list' | 'map' = 'list';
  nearMeActive = false;

  isLoggedIn = false;
  private destroy$      = new Subject<void>();
  private searchSubject = new Subject<void>();

  constructor(
    private listingService: ListingService,
    private authService:    AuthService,
    private router:         Router,
    private route:          ActivatedRoute,
    private wishlistSvc:    WishlistService,
  ) {}

  ngOnInit(): void {
    this.isLoggedIn = this.authService.isLoggedIn;

    // Restore filters from URL query params (shareable / back-button friendly)
    const qp = this.route.snapshot.queryParams;
    if (qp['search'])   this.filters.search   = qp['search'];
    if (qp['category']) this.filters.category = qp['category'];
    if (qp['city'])     this.filters.city     = qp['city'];
    if (qp['minPrice']) { this.filters.minPrice = +qp['minPrice']; this.minPriceInput = +qp['minPrice']; }
    if (qp['maxPrice']) { this.filters.maxPrice = +qp['maxPrice']; this.maxPriceInput = +qp['maxPrice']; }
    if (qp['page'])     { this.filters.page = +qp['page']; }

    // Debounce text search to avoid API spam
    this.searchSubject.pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => { this.filters.page = 1; this.loadListings(); });

    this.loadCategories();
    this.loadListings();
    if (this.isLoggedIn) this.wishlistSvc.getWishlist().subscribe();
  }

  /** Sync current filters into the URL (no reload). */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search:   this.filters.search   || null,
        category: this.filters.category || null,
        city:     this.filters.city     || null,
        minPrice: this.filters.minPrice || null,
        maxPrice: this.filters.maxPrice || null,
        page:     (this.filters.page && this.filters.page > 1) ? this.filters.page : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ── Wishlist heart (per card) ────────────────────────────────────────────────
  isSaved(listing: any): boolean {
    const id = listing?._id || listing?.id;
    return id ? this.wishlistSvc.isSaved(id) : false;
  }

  toggleWishlist(listing: any, event: Event): void {
    event.stopPropagation();   // don't trigger card click (navigate)
    const id = listing?._id || listing?.id;
    if (!id) return;
    this.wishlistSvc.toggle(id).subscribe({
      error: (err: any) => alert('Wishlist error: ' + (err?.error?.message || 'failed')),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data Loading ───────────────────────────────────────────────────────────
  loadListings(): void {
    this.loading = true;
    this.error   = '';
    this.listingService.getListings(this.filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          let items = res.data.listings || [];
          // Safety net: make sure ONLY the selected category is shown, even if
          // the backend filter didn't apply (e.g. category name mismatch).
          if (this.filters.category) {
            const q = this.filters.category.trim().toLowerCase();
            const first = q.split(/\s|&/)[0];
            items = items.filter((l: any) => {
              const lc = (l.category || '').toLowerCase();
              return lc === q || lc.startsWith(q) || (first.length >= 4 && lc.startsWith(first));
            });
          }
          this.listings   = items;
          this.pagination = res.data.pagination;
          // Keep the "N listings found" count in sync with the client-side filter.
          if (this.filters.category && this.pagination) {
            this.pagination = { ...this.pagination, total: items.length };
          }
          this.loading    = false;
          this.syncUrl();
        },
        error: (err) => {
          this.error   = err.error?.message || 'Failed to load listings.';
          this.loading = false;
        },
      });
  }

  loadCategories(): void {
    this.listingService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => { this.categories = res.data.categories; },
        error: () => {},
      });
  }

  // ── Filter Handlers ────────────────────────────────────────────────────────
  onSearchInput(): void { this.searchSubject.next(); }

  clearSearch(): void {
    this.filters.search = '';
    this.filters.page   = 1;
    this.loadListings();
  }

  setCategory(cat: string): void {
    this.filters.category = cat;
    this.filters.page     = 1;
    this.loadListings();
  }

  applyPriceFilter(): void {
    this.filters.minPrice = this.minPriceInput || undefined;
    this.filters.maxPrice = this.maxPriceInput || undefined;
    this.filters.page     = 1;
    this.loadListings();
  }

  clearPriceFilter(): void {
    this.minPriceInput    = undefined;
    this.maxPriceInput    = undefined;
    this.filters.minPrice = undefined;
    this.filters.maxPrice = undefined;
    this.filters.page     = 1;
    this.loadListings();
  }

  // City dropdown change — immediate reload (no debounce needed for select)
  onCityFilterChange(): void {
    this.filters.page = 1;
    this.loadListings();
  }

  // Kept for backward compatibility (no longer used with dropdown)
  onCityInput(): void {
    this.filters.page = 1;
    this.loadListings();
  }

  onSortChange(): void {
    this.filters.page = 1;
    this.loadListings();
  }

  clearAllFilters(): void {
    this.filters = { search: '', category: '', city: '', sortBy: 'createdAt', order: 'desc', page: 1, limit: 12 };
    this.minPriceInput = undefined;
    this.maxPriceInput = undefined;
    this.loadListings();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filters.search || this.filters.category || this.filters.city ||
      this.filters.minPrice || this.filters.maxPrice
    );
  }

  changePage(page: number): void {
    this.filters.page = page;
    this.loadListings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  viewListing(listing: Listing): void {
    const id = listing.id || listing._id;
    this.router.navigate(['/listings', id]);
  }

  // ── Display helpers ────────────────────────────────────────────────────────
  /** Hide a broken image and reveal its placeholder sibling. */
  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const ph = img.nextElementSibling as HTMLElement | null;
    if (ph) ph.style.display = 'flex';
  }

  getTotalCount(): number {
    return this.categories.reduce((s, c) => s + (c.count || 0), 0);
  }

  readonly catIconMap: Record<string, string> = {
    'Electronics': 'camera', 'Vehicles': 'car', 'Furniture': 'sofa',
    'Tools & Equipment': 'tools', 'Sports & Outdoors': 'bike',
    'Clothing & Accessories': 'dress', 'Books & Media': 'book',
    'Home Appliances': 'home', 'Musical Instruments': 'music',
    'Photography & Video': 'photo', 'Party & Events': 'party',
    'Baby & Kids': 'baby', 'Gaming': 'gaming', 'Travel & Luggage': 'travel',
    'Other': 'other',
  };
  getCatIcon(name: string): string { return this.catIconMap[name] || 'other'; }

  getPriceUnitLabel(unit: string): string {
    return PRICE_UNIT_LABELS[unit as keyof typeof PRICE_UNIT_LABELS] || '';
  }

  isOwnerObject(owner: any): owner is ListingOwner {
    return owner && typeof owner === 'object';
  }

  // ── Image Lightbox Gallery ──────────────────────────────────────────────────
  lightboxOpen = false;
  lightboxImages: string[] = [];
  lightboxIndex = 0;
  lightboxZoom = 1;

  openLightbox(listing: any, startIndex = 0, event?: Event): void {
    if (event) event.stopPropagation();
    const imgs = (listing.images || [])
      .map((im: any) => im?.url || im)
      .filter((u: any) => !!u);
    if (!imgs.length) return;
    this.lightboxImages = imgs;
    this.lightboxIndex  = Math.min(startIndex, imgs.length - 1);
    this.lightboxZoom   = 1;
    this.lightboxOpen   = true;
    document.body.style.overflow = 'hidden';
  }
  closeLightbox(): void {
    this.lightboxOpen = false;
    this.lightboxZoom = 1;
    document.body.style.overflow = '';
  }
  nextImage(e?: Event): void {
    if (e) e.stopPropagation();
    if (!this.lightboxImages.length) return;
    this.lightboxIndex = (this.lightboxIndex + 1) % this.lightboxImages.length;
    this.lightboxZoom = 1;
  }
  prevImage(e?: Event): void {
    if (e) e.stopPropagation();
    if (!this.lightboxImages.length) return;
    this.lightboxIndex = (this.lightboxIndex - 1 + this.lightboxImages.length) % this.lightboxImages.length;
    this.lightboxZoom = 1;
  }
  zoomIn(e?: Event):  void { if (e) e.stopPropagation(); this.lightboxZoom = Math.min(this.lightboxZoom + 0.4, 3); }
  zoomOut(e?: Event): void { if (e) e.stopPropagation(); this.lightboxZoom = Math.max(this.lightboxZoom - 0.4, 1); }

  imgCount(listing: any): number {
    return (listing.images || []).filter((im: any) => (im?.url || im)).length;
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.lightboxOpen) return;
    if (e.key === 'Escape')      this.closeLightbox();
    else if (e.key === 'ArrowRight') this.nextImage();
    else if (e.key === 'ArrowLeft')  this.prevImage();
    else if (e.key === '+' || e.key === '=') this.zoomIn();
    else if (e.key === '-')      this.zoomOut();
  }

  getOwnerInitial(owner: any): string {
    if (typeof owner === 'object' && owner?.name) return owner.name.charAt(0).toUpperCase();
    return '?';
  }

  /** Owner trust badge tier, or 'none' if not a populated owner / no badge. */
  ownerBadge(owner: any): string {
    return (typeof owner === 'object' && owner?.trustBadge) ? owner.trustBadge : 'none';
  }

  /** Owner trust score, or null. */
  ownerScore(owner: any): number | null {
    return (typeof owner === 'object' && typeof owner?.trustScore === 'number') ? owner.trustScore : null;
  }

  /** Switch between list and map views. */
  setView(mode: 'list' | 'map'): void {
    this.viewMode = mode;
  }

  /** "Near me" — fetch listings around the user's GPS location. */
  onNearMe(coords: { lat: number; lng: number }): void {
    this.loading = true;
    this.nearMeActive = true;
    this.listingService.getNearby(coords.lat, coords.lng, 25, this.filters.category || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.listings = res?.data?.listings || [];
          this.loading = false;
        },
        error: () => {
          this.error = 'Could not load nearby listings.';
          this.loading = false;
        },
      });
  }
}
