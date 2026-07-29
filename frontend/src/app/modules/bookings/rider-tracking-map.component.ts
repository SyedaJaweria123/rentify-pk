// src/app/modules/bookings/rider-tracking-map.component.ts
/**
 * RiderTrackingMapComponent — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Leaflet.js map jo live rider location show karta hai.
 *
 * USAGE: Booking detail page pe add karo jab booking 'in_delivery' ho:
 *   <app-rider-tracking-map
 *     [bookingId]="booking._id"
 *     [renterLat]="renterLat"
 *     [renterLng]="renterLng"
 *     [ownerLat]="ownerLat"
 *     [ownerLng]="ownerLng">
 *   </app-rider-tracking-map>
 *
 * KAISE KAAM KARTA HAI:
 *   1. Component mount hone par Leaflet map initialize hota hai
 *   2. SocketService ka lastRiderLocation signal watch karta hai
 *   3. Jab bhi signal update ho (har 5s) → rider marker move karta hai
 *   4. Map pan karta hai rider ke saath automatically
 *   5. Delivery complete hone par "Delivered!" message aata hai
 *
 * INSTALL KARO:
 *   npm install leaflet @types/leaflet
 *   angular.json → styles mein add karo:
 *     "node_modules/leaflet/dist/leaflet.css"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Component, OnInit, OnDestroy, AfterViewInit,
  Input, effect, PLATFORM_ID, Inject
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { SocketService, RiderLocation }   from '../../core/services/socket.service';

// Leaflet types (import only types at module level; actual lib loaded lazily)
import type * as L from 'leaflet';

@Component({
  selector   : 'app-rider-tracking-map',
  standalone : true,
  imports    : [CommonModule],
  template   : `
    <div class="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">

      <!-- Header bar -->
      <div class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <!-- Pulsing dot = live -->
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
          </span>
          <span class="font-semibold text-sm">Live Rider Location</span>
        </div>
        <span class="text-xs text-indigo-200">{{ statusLabel }}</span>
      </div>

      <!-- Map container — Leaflet renders here -->
      <div id="rider-map-{{ bookingId }}"
           style="height: 320px; width: 100%;"
           class="bg-gray-100">
      </div>

      <!-- Footer: last update time -->
      <div class="bg-gray-50 px-4 py-2 text-xs text-gray-400 flex justify-between">
        <span>{{ riderOnline ? 'Rider online' : 'Waiting for rider location...' }}</span>
        <span *ngIf="lastUpdateTime">Last update: {{ lastUpdateTime }}</span>
      </div>

    </div>
  `,
})
export class RiderTrackingMapComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Inputs from parent (booking-detail component) ─────────────────────────
  @Input() bookingId  : string = '';
  @Input() renterLat  : number = 0;    // delivery destination
  @Input() renterLng  : number = 0;
  @Input() ownerLat   : number = 0;    // pickup origin
  @Input() ownerLng   : number = 0;

  // ── State ──────────────────────────────────────────────────────────────────
  riderOnline    = false;
  statusLabel    = 'Waiting...';
  lastUpdateTime = '';

  // ── Leaflet objects (private, only used internally) ───────────────────────
  private map          : L.Map            | null = null;
  private riderMarker  : L.Marker         | null = null;
  private renterMarker : L.Marker         | null = null;
  private ownerMarker  : L.Marker         | null = null;
  private routeLine    : L.Polyline       | null = null;
  private L            : typeof import('leaflet') | null = null;  // lazy loaded

  constructor(
    private socketSvc             : SocketService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    /**
     * effect() — Angular reactivity.
     * Jab bhi lastRiderLocation signal change ho, yeh automatically chale ga.
     * SSR safe hai kyunke isPlatformBrowser check hai.
     */
    effect(() => {
      const loc = this.socketSvc.lastRiderLocation();
      if (loc && this.map && this.L) {
        this.onRiderLocationUpdate(loc);
      }
    });
  }

  ngOnInit(): void {}

  // ── Map initialize karo (view ready hone ke baad) ─────────────────────────
  async ngAfterViewInit(): Promise<void> {
    // Server-side rendering check — Leaflet only works in browser
    if (!isPlatformBrowser(this.platformId)) return;

    // Lazy load Leaflet (reduces initial bundle size)
    this.L = await import('leaflet');
    this.initMap();
  }

  // ── Leaflet Map Setup ──────────────────────────────────────────────────────
  private initMap(): void {
    if (!this.L) return;
    const L = this.L;

    // Map container ID is unique per booking (multiple maps on one page safe)
    const containerId = `rider-map-${this.bookingId}`;
    const container   = document.getElementById(containerId);
    if (!container) return;

    // Default center: Karachi (fallback agar koi coordinates na hon)
    const defaultCenter: L.LatLngExpression = [24.8607, 67.0011];
    const startCenter   = this.ownerLat
      ? [this.ownerLat, this.ownerLng] as L.LatLngExpression
      : defaultCenter;

    // Initialize map
    this.map = L.map(containerId, {
      center : startCenter,
      zoom   : 14,
      zoomControl: true,
    });

    // OpenStreetMap tiles (free, no API key needed)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom    : 19,
    }).addTo(this.map);

    // Add fixed markers for pickup (owner) and delivery (renter)
    this.addStaticMarkers(L);
  }

  // ── Static markers: owner (green) + renter (blue) ─────────────────────────
  private addStaticMarkers(L: typeof import('leaflet')): void {
    // Owner / pickup marker (green house icon)
    if (this.ownerLat && this.ownerLng) {
      const ownerIcon = L.divIcon({
        html     : `<div style="
          background:#16a34a; color:white; border-radius:50%;
          width:36px; height:36px; display:flex; align-items:center;
          justify-content:center; font-size:18px; border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏠</div>`,
        className: '',
        iconSize : [36, 36],
        iconAnchor:[18, 36],
      });
      this.ownerMarker = L.marker([this.ownerLat, this.ownerLng], { icon: ownerIcon })
        .addTo(this.map!)
        .bindPopup('<b>Pickup Location</b><br>Owner ka ghar');
    }

    // Renter / delivery marker (blue flag icon)
    if (this.renterLat && this.renterLng) {
      const renterIcon = L.divIcon({
        html     : `<div style="
          background:#2563eb; color:white; border-radius:50%;
          width:36px; height:36px; display:flex; align-items:center;
          justify-content:center; font-size:18px; border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3)">📍</div>`,
        className: '',
        iconSize : [36, 36],
        iconAnchor:[18, 36],
      });
      this.renterMarker = L.marker([this.renterLat, this.renterLng], { icon: renterIcon })
        .addTo(this.map!)
        .bindPopup('<b>Delivery Location</b><br>Aapka address');
    }
  }

  // ── Called every time rider sends a new location ──────────────────────────
  private onRiderLocationUpdate(loc: RiderLocation): void {
    // Filter: only process locations for THIS booking
    if (loc.bookingId && loc.bookingId !== this.bookingId) return;
    if (!this.L || !this.map) return;

    const L        = this.L;
    const position : L.LatLngExpression = [loc.lat, loc.lng];

    this.riderOnline    = true;
    this.lastUpdateTime = new Date(loc.ts).toLocaleTimeString('en-PK');
    this.statusLabel    = loc.status === 'picked_up'
      ? 'In Delivery'
      : loc.status === 'accepted'
        ? 'Going to Pickup'
        : 'Active';

    if (this.riderMarker) {
      // Marker already exists — smoothly move it to new position
      this.riderMarker.setLatLng(position);
    } else {
      // First location received — create the rider marker (motorcycle emoji)
      const riderIcon = L.divIcon({
        html     : `<div style="
          background:#7c3aed; color:white; border-radius:50%;
          width:40px; height:40px; display:flex; align-items:center;
          justify-content:center; font-size:20px; border:3px solid white;
          box-shadow:0 2px 12px rgba(124,58,237,0.5); animation: pulse 2s infinite">🛵</div>`,
        className: '',
        iconSize : [40, 40],
        iconAnchor:[20, 40],
      });
      this.riderMarker = L.marker(position, { icon: riderIcon, zIndexOffset: 1000 })
        .addTo(this.map)
        .bindPopup('<b>Rider</b><br>Live location');

      // Center map on rider when first seen
      this.map.setView(position, 15);
    }

    // Draw dotted route line: rider → destination
    const destination = loc.status === 'picked_up' && this.renterLat
      ? [this.renterLat, this.renterLng] as L.LatLngExpression
      : this.ownerLat
        ? [this.ownerLat, this.ownerLng] as L.LatLngExpression
        : null;

    if (destination) {
      if (this.routeLine) {
        // Update existing line
        this.routeLine.setLatLngs([position, destination]);
      } else {
        // Create new dashed line
        this.routeLine = L.polyline([position, destination], {
          color    : '#7c3aed',
          weight   : 3,
          dashArray: '8, 8',
          opacity  : 0.7,
        }).addTo(this.map);
      }
    }

    // Pan map to keep rider in view (gently, don't reset zoom)
    this.map.panTo(position, { animate: true, duration: 0.5 });
  }

  // ── Cleanup: destroy map on component destroy ─────────────────────────────
  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();   // Leaflet cleanup
      this.map = null;
    }
    this.riderMarker  = null;
    this.renterMarker = null;
    this.ownerMarker  = null;
    this.routeLine    = null;
  }
}
