// src/app/modules/wishlist/wishlist-page.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WishlistService } from './wishlist.service';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [CommonModule, RouterModule, DecimalPipe],
  template: `
  <div class="wl-page">
    <div class="wl-head">
      <h1 class="wl-title">❤️ My Wishlist</h1>
      <p class="wl-sub">Listings you've saved for later</p>
    </div>

    <div class="wl-loading" *ngIf="loading()">
      <div class="spin"></div><p>Loading your wishlist…</p>
    </div>

    <div class="wl-empty" *ngIf="!loading() && listings().length === 0">
      <span class="wl-empty-icon">🤍</span>
      <p class="wl-empty-title">No saved listings yet</p>
      <p class="wl-empty-sub">Tap the heart on any listing to save it here.</p>
      <a routerLink="/listings" class="wl-browse">Browse Listings →</a>
    </div>

    <div class="wl-grid" *ngIf="!loading() && listings().length > 0">
      <div class="wl-card" *ngFor="let l of listings()">
        <a [routerLink]="['/listings', l._id || l.id]" class="wl-img-wrap">
          <img *ngIf="coverOf(l)" [src]="coverOf(l)" [alt]="l.title"/>
          <div *ngIf="!coverOf(l)" class="wl-noimg">📦</div>
          <span class="wl-cat">{{ l.category }}</span>
        </a>
        <button class="wl-heart" (click)="remove(l)" aria-label="Remove from wishlist">❤️</button>
        <div class="wl-body">
          <a [routerLink]="['/listings', l._id || l.id]" class="wl-name">{{ l.title }}</a>
          <p class="wl-city" *ngIf="l.city">📍 {{ l.city }}</p>
          <p class="wl-price">Rs {{ l.price | number:'1.0-0' }}<span class="wl-unit">/{{ l.priceUnit }}</span></p>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { --primary:#00A651; --red:#FF4D4D; --text:#1A1D1F; --text-2:#6F767E;
            --border:#EFEFEF; --surface:#F5F7FA; display:block; }
    .wl-page { max-width:1100px; margin:0 auto; padding:32px 20px; }
    .wl-head { margin-bottom:24px; }
    .wl-title { font-size:26px; font-weight:900; color:var(--text); }
    .wl-sub { font-size:14px; color:var(--text-2); margin-top:4px; }

    .wl-loading, .wl-empty { text-align:center; padding:60px 20px; color:var(--text-2); }
    .spin { width:30px; height:30px; border:3px solid var(--border); border-top-color:var(--primary);
            border-radius:50%; animation:sp .7s linear infinite; margin:0 auto 12px; }
    @keyframes sp { to { transform:rotate(360deg); } }
    .wl-empty-icon { font-size:48px; display:block; margin-bottom:10px; }
    .wl-empty-title { font-size:18px; font-weight:700; color:var(--text); }
    .wl-empty-sub { font-size:14px; margin:6px 0 18px; }
    .wl-browse { display:inline-block; padding:11px 24px; background:var(--primary); color:#fff;
                 border-radius:10px; font-weight:700; text-decoration:none; }

    .wl-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:20px; }
    .wl-card { position:relative; background:#fff; border:1px solid var(--border);
               border-radius:16px; overflow:hidden; transition:transform .2s, box-shadow .2s; }
    .wl-card:hover { transform:translateY(-4px); box-shadow:0 12px 28px rgba(0,0,0,.1); }
    .wl-img-wrap { display:block; position:relative; aspect-ratio:1.4; background:var(--surface); }
    .wl-img-wrap img { width:100%; height:100%; object-fit:cover; }
    .wl-noimg { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:34px; }
    .wl-cat { position:absolute; top:10px; left:10px; background:rgba(0,0,0,.65); color:#fff;
              font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; }
    .wl-heart { position:absolute; top:10px; right:10px; width:34px; height:34px; border-radius:50%;
                border:none; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.15); cursor:pointer; font-size:16px; }
    .wl-heart:hover { transform:scale(1.1); }
    .wl-body { padding:14px; }
    .wl-name { display:block; font-size:15px; font-weight:700; color:var(--text); text-decoration:none;
               white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .wl-name:hover { color:var(--primary); }
    .wl-city { font-size:12px; color:var(--text-2); margin:4px 0; }
    .wl-price { font-size:16px; font-weight:800; color:var(--primary); }
    .wl-unit { font-size:12px; font-weight:500; color:var(--text-2); }
  `],
})
export class WishlistPageComponent implements OnInit {
  loading  = signal(true);
  listings = signal<any[]>([]);

  constructor(private wishlist: WishlistService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.wishlist.getWishlist().subscribe({
      next: (res: any) => { this.listings.set(res.data?.listings || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  coverOf(l: any): string {
    return l.coverImage || l.images?.[0]?.url || l.images?.[0] || '';
  }

  remove(l: any): void {
    const id = l._id || l.id;
    this.wishlist.remove(id).subscribe({
      next: () => this.listings.update(list => list.filter(x => (x._id || x.id) !== id)),
    });
  }
}
