import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, catchError } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/* ── Interfaces ── */
export interface PlatformStats {
  totalListings:  number;
  totalUsers:     number;
  totalOwners:    number;
  totalBookings:  number;
  totalCities:    number;
  display: {
    listings: string;   // "500+"
    users:    string;   // "1,200+"
    owners:   string;   // "120+"
    bookings: string;   // "2,400+"
    cities:   string;   // "50+"
  };
}

export interface TeamMember {
  _id:             string;
  name:            string;
  role:            string;
  city:            string;
  bio:             string;
  avatar:          string | null;
  avatarInitials:  string;
  linkedIn?:       string;
  order:           number;
}

export interface Testimonial {
  _id:             string;
  name:            string;
  city:            string;
  role:            'Renter' | 'Owner';
  text:            string;
  rating:          number;
  avatar:          string | null;
  avatarInitials:  string;
  order:           number;
}

export interface OwnerStory {
  _id:             string;
  name:            string;
  city:            string;
  itemListed:      string;
  monthlyEarning:  number;
  avatar:          string | null;
  avatarInitials:  string;
  order:           number;
}

export interface BookedDateRange {
  start: string;   // "2025-06-01"
  end:   string;   // "2025-06-05"
}

/* ── Fallback data shown while loading or on API error ── */
const STATS_FALLBACK: PlatformStats = {
  totalListings: 0, totalUsers: 0, totalOwners: 0,
  totalBookings: 0, totalCities: 0,
  display: { listings: '…', users: '…', owners: '…', bookings: '…', cities: '…' },
};

@Injectable({ providedIn: 'root' })
export class CmsService {
  private api = environment.apiUrl;

  // Cache active observables so multiple components on the same page
  // don't each fire their own HTTP request
  private statsCache$?: Observable<PlatformStats>;
  private teamCache$?:   Observable<TeamMember[]>;
  private testiCache$?:  Observable<Testimonial[]>;
  private storiesCache$?:Observable<OwnerStory[]>;

  constructor(private http: HttpClient) {}

  // ── Platform Stats ─────────────────────────────────────────────────────────
  /**
   * GET /api/stats
   * Returns real counts from MongoDB (listings, users, cities, bookings).
   * Cached with shareReplay(1) so all subscribers share one HTTP call.
   * Falls back to empty display values if the request fails.
   */
  getStats(): Observable<PlatformStats> {
    if (!this.statsCache$) {
      this.statsCache$ = this.http
        .get<{ success: boolean; data: PlatformStats }>(`${this.api}/stats`)
        .pipe(
          map(res => res.data),
          catchError(err => {
            console.warn('Stats API unavailable:', err.message);
            return of(STATS_FALLBACK);
          }),
          shareReplay(1),  // share across all subscribers, replay last value
        );
    }
    return this.statsCache$;
  }

  /** Clear stats cache (e.g. after admin action that changes counts) */
  clearStatsCache(): void { this.statsCache$ = undefined; }

  // ── Team Members ───────────────────────────────────────────────────────────
  /**
   * GET /api/cms/team
   * Active team members ordered by `order` field.
   */
  getTeam(): Observable<TeamMember[]> {
    if (!this.teamCache$) {
      this.teamCache$ = this.http
        .get<{ success: boolean; data: { members: TeamMember[] } }>(`${this.api}/cms/team`)
        .pipe(
          map(res => res.data.members),
          catchError(() => of([])),
          shareReplay(1),
        );
    }
    return this.teamCache$;
  }

  // ── Testimonials ───────────────────────────────────────────────────────────
  /**
   * GET /api/cms/testimonials?limit=3
   * Active testimonials for home page and about page.
   */
  getTestimonials(limit = 3): Observable<Testimonial[]> {
    if (!this.testiCache$) {
      this.testiCache$ = this.http
        .get<{ success: boolean; data: { testimonials: Testimonial[] } }>(
          `${this.api}/cms/testimonials?limit=${limit}`
        )
        .pipe(
          map(res => res.data.testimonials),
          catchError(() => of([])),
          shareReplay(1),
        );
    }
    return this.testiCache$;
  }

  // ── Owner Stories ──────────────────────────────────────────────────────────
  /**
   * GET /api/cms/owner-stories?limit=3
   * Owner success stories for /become-owner page.
   */
  getOwnerStories(limit = 3): Observable<OwnerStory[]> {
    if (!this.storiesCache$) {
      this.storiesCache$ = this.http
        .get<{ success: boolean; data: { stories: OwnerStory[] } }>(
          `${this.api}/cms/owner-stories?limit=${limit}`
        )
        .pipe(
          map(res => res.data.stories),
          catchError(() => of([])),
          shareReplay(1),
        );
    }
    return this.storiesCache$;
  }

  // ── Booked Date Ranges (for availability calendar) ─────────────────────────
  /**
   * GET /api/bookings/booked-dates?listing=:listingId
   * Returns date ranges of confirmed/active/pending bookings.
   * Used by listing-detail calendar to grey out unavailable dates.
   */
  getBookedDates(listingId: string): Observable<BookedDateRange[]> {
    return this.http
      .get<{ success: boolean; data: { ranges: BookedDateRange[] } }>(
        `${this.api}/bookings/booked-dates?listing=${listingId}`
      )
      .pipe(
        map(res => res.data.ranges),
        catchError(() => of([])),  // on error, show all dates as available
      );
  }

  // ── Star array helper (shared across components) ───────────────────────────
  getStars(rating: number, total = 5): boolean[] {
    return Array.from({ length: total }, (_, i) => i < Math.round(rating));
  }
}
