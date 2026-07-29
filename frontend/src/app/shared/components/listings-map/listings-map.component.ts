import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges,
  ElementRef, ViewChild, AfterViewInit, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { PK_CENTER, coordsForCity } from '../../../models/pk-city-coords';
import { Listing } from '../../../models/listing.model';

/**
 * Listings map (Leaflet, no API key).
 *   <app-listings-map [listings]="listings" [city]="filters.city"
 *       (listingClick)="viewListing($event)" (nearMe)="onNearMe($event)">
 *   </app-listings-map>
 *
 * Shows each listing that has coordinates as a pin. A "Near me" button asks the
 * browser for GPS and emits the coordinates so the parent can fetch nearby
 * listings from the backend.
 */
@Component({
  selector: 'app-listings-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-wrap">
      <button type="button" class="near-me" (click)="locateMe()" [disabled]="locating">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
        {{ locating ? 'Locating…' : 'Listings near me' }}
      </button>
      <div #mapEl class="map-el"></div>
      <p class="map-hint" *ngIf="geoError">{{ geoError }}</p>
    </div>
  `,
  styles: [`
    .map-wrap { position: relative; width: 100%; }
    .map-el {
      width: 100%; height: 460px; border-radius: 14px;
      overflow: hidden; border: 1px solid #e7e1da; z-index: 0;
    }
    .near-me {
      position: absolute; top: 12px; right: 12px; z-index: 500;
      display: inline-flex; align-items: center; gap: 6px;
      background: #1F5435; color: #fff; border: none;
      font-weight: 600; font-size: 0.82rem; padding: 0.5rem 0.85rem;
      border-radius: 10px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.18);
      font-family: inherit;
    }
    .near-me:hover:not(:disabled) { background: #143524; }
    .near-me:disabled { opacity: .65; cursor: default; }
    .map-hint { margin: 8px 2px 0; font-size: 0.8rem; color: #b91c1c; }
  `],
})
export class ListingsMapComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl', { static: false }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() listings: Listing[] = [];
  @Input() city: string | null = null;

  @Output() listingClick = new EventEmitter<Listing>();
  @Output() nearMe = new EventEmitter<{ lat: number; lng: number }>();

  private map: L.Map | null = null;
  private markers: L.LayerGroup = L.layerGroup();
  private meMarker: L.CircleMarker | null = null;
  locating = false;
  geoError = '';

  ngOnInit(): void {
    // Fix default marker icon paths (Leaflet + bundlers need explicit URLs).
    const iconBase = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/';
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: iconBase + 'marker-icon-2x.png',
      iconUrl:       iconBase + 'marker-icon.png',
      shadowUrl:     iconBase + 'marker-shadow.png',
    });
  }

  ngAfterViewInit(): void {
    const center = coordsForCity(this.city) || PK_CENTER;
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: true })
      .setView([center.lat, center.lng], this.city ? 12 : 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    this.markers.addTo(this.map);
    this.renderMarkers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['listings']) this.renderMarkers();
    if (changes['city'] && this.city) {
      const c = coordsForCity(this.city);
      if (c) this.map.setView([c.lat, c.lng], 12);
    }
  }

  private renderMarkers(): void {
    if (!this.map) return;
    this.markers.clearLayers();

    const pts: L.LatLngExpression[] = [];
    for (const l of this.listings || []) {
      const lat = l.lat, lng = l.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;

      const price = l.price != null ? `Rs ${l.price.toLocaleString()}` : '';
      const popup =
        `<div style="min-width:160px">
           <strong>${this.esc(l.title)}</strong><br>
           <span style="color:#810B38;font-weight:600">${price}</span>
           ${l.city ? ' · ' + this.esc(l.city) : ''}<br>
           <a href="#" data-id="${l._id || l.id}" class="map-view-link"
              style="color:#810B38;font-weight:600">View listing →</a>
         </div>`;

      const m = L.marker([lat, lng]).bindPopup(popup);
      m.on('popupopen', (e) => {
        const link = (e.popup.getElement() || document).querySelector('.map-view-link');
        link?.addEventListener('click', (ev) => {
          ev.preventDefault();
          this.listingClick.emit(l);
        });
      });
      this.markers.addLayer(m);
      pts.push([lat, lng]);
    }

    // Fit map to markers if we have any
    if (pts.length) {
      this.map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 });
    }
  }

  locateMe(): void {
    this.geoError = '';
    if (!navigator.geolocation) {
      this.geoError = 'Location is not supported by your browser.';
      return;
    }
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating = false;
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (this.map) {
          this.map.setView([lat, lng], 13);
          if (this.meMarker) this.meMarker.remove();
          this.meMarker = L.circleMarker([lat, lng], {
            radius: 9, color: '#1F5435', fillColor: '#1F5435', fillOpacity: 0.6, weight: 2,
          }).addTo(this.map).bindPopup('You are here');
        }
        this.nearMe.emit({ lat, lng });
      },
      (err) => {
        this.locating = false;
        this.geoError = err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Please allow access to find nearby listings.'
          : 'Could not get your location. Please try again.';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  private esc(s: string): string {
    return String(s || '').replace(/[<>&"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c));
  }

  ngOnDestroy(): void {
    if (this.map) { this.map.remove(); this.map = null; }
  }
}
