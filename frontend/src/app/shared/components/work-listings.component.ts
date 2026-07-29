// src/app/shared/components/work-listings.component.ts
/**
 * WorkListingsComponent — Rentify PK
 * Popular Listings on a full green background: a big centered heading and a
 * smooth auto-scrolling row of large, image-focused cards (fashion-store style)
 * — hover reveals a "View Details" bar, with title / category / price below.
 */
import { Component, Input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { WishlistService } from '../../modules/wishlist/wishlist.service';

@Component({
  selector: 'app-work-listings',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  template: `
  <section class="pls">
    <div class="pls-head">
      <h2 class="pls-title">Popular Listings</h2>
      <p class="pls-sub">Top-rated items available for rent near you</p>
    </div>

    <div class="pls-carousel">
      <div class="pls-track">
        <div class="pls-card" *ngFor="let item of loopItems" (click)="open(item._id)">
          <div class="pls-img-wrap">
            <div class="pls-img" [style.background-image]="item.images?.[0]?.url ? 'url(' + item.images[0].url + ')' : ''">
              <span class="pls-img-empty" *ngIf="!item.images?.[0]?.url">📦</span>
            </div>
            <div class="pls-hover">
              <span class="pls-hover-text">View Details</span>
              <button class="pls-heart" (click)="toggleWishlist(item._id, $event)" [class.saved]="isSaved(item._id)" aria-label="Save to wishlist">
                <svg width="16" height="16" viewBox="0 0 24 24" [attr.fill]="isSaved(item._id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>
              </button>
            </div>
          </div>
          <div class="pls-info">
            <p class="pls-info-title">{{ item.title }}</p>
            <p class="pls-info-sub">{{ item.category || 'Rental' }}<span *ngIf="item.city"> · {{ item.city }}</span></p>
            <p class="pls-info-price">Rs {{ item.price | number:'1.0-0' }} <span>/{{ item.priceUnit || 'day' }}</span></p>
          </div>
        </div>
      </div>
    </div>

    <div class="pls-foot">
      <a class="pls-all" (click)="seeAll()">See all listings →</a>
    </div>
  </section>
  `,
  styles: [`
    :host { display: block; }
    .pls { position: relative; background: transparent; padding: 60px 0 56px; overflow: hidden; }

    /* Big centered heading */
    .pls-head { text-align: center; max-width: 760px; margin: 0 auto 38px; padding: 0 24px; }
    .pls-title { font-size: clamp(34px, 5vw, 52px); font-weight: 900; color: #143524; margin: 0; letter-spacing: -1px; }
    .pls-sub { font-size: 16px; color: #6b7a6f; margin: 12px 0 0; }

    /* Auto-scrolling carousel */
    .pls-carousel { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent); mask-image: linear-gradient(90deg, transparent, #000 3%, #000 97%, transparent); }
    .pls-track { display: flex; gap: 22px; width: max-content; padding: 0 22px; animation: plsScroll 50s linear infinite; }
    .pls-carousel:hover .pls-track { animation-play-state: paused; }
    @keyframes plsScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

    /* Fashion-store style cards: big image, hover bar, info below */
    .pls-card { flex: 0 0 auto; width: 300px; cursor: pointer; }
    .pls-img-wrap { position: relative; overflow: hidden; border-radius: 4px; }
    .pls-img { height: 400px; background: linear-gradient(135deg, #eef3ee 0%, #cfe3d3 100%); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; transition: transform .6s cubic-bezier(.19,1,.22,1); }
    .pls-card:hover .pls-img { transform: scale(1.05); }
    .pls-img-empty { font-size: 50px; opacity: .5; }
    .pls-hover { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,.97); display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; transform: translateY(100%); transition: transform .38s cubic-bezier(.19,1,.22,1); }
    .pls-card:hover .pls-hover { transform: translateY(0); }
    .pls-hover-text { font-size: 13px; font-weight: 800; letter-spacing: .5px; color: #143524; text-transform: uppercase; }
    .pls-heart { background: none; border: none; cursor: pointer; color: #143524; padding: 4px; display: flex; }
    .pls-heart.saved { color: #e0245e; }

    .pls-info { padding: 14px 2px 0; }
    .pls-info-title { font-size: 15px; font-weight: 800; color: #143524; margin: 0 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pls-info-sub { font-size: 12px; font-weight: 600; letter-spacing: .3px; color: #8a9484; text-transform: uppercase; margin: 0 0 6px; }
    .pls-info-price { font-size: 16px; font-weight: 900; color: #1F5435; margin: 0; }
    .pls-info-price span { font-size: 12px; font-weight: 600; color: #8a9484; }

    .pls-foot { text-align: center; margin-top: 40px; }
    .pls-all { display: inline-block; font-size: 14px; font-weight: 800; color: #fff; background: #1F5435; padding: 13px 28px; border-radius: 999px; cursor: pointer; transition: transform .2s, box-shadow .2s; }
    .pls-all:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(31,84,45,.3); }

    @media (max-width: 560px) { .pls { padding: 46px 0 44px; } .pls-card { width: 250px; } .pls-img { height: 330px; } }
  `],
})
export class WorkListingsComponent {
  @Input() items: any[] = [];

  constructor(
    private router: Router,
    private auth: AuthService,
    public wishlist: WishlistService,
  ) {}

  get loopItems(): any[] { return this.items.length ? [...this.items, ...this.items] : []; }

  seeAll(): void { this.router.navigate(['/listings']); }
  open(id: string): void { this.router.navigate(['/listings', id]); }
  isSaved(id: string): boolean { return this.wishlist.isSaved(id); }
  toggleWishlist(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn) { this.router.navigate(['/auth/login']); return; }
    this.wishlist.toggle(id).subscribe({ error: () => {} });
  }
}
