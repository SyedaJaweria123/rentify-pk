import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-booking-card',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatChipsModule, MatTooltipModule, MatIconModule, DatePipe],
  template: `
    <div class="bk-c">

      <!-- Listing Image -->
      <div class="bk-c-thumb">
        @if (booking.listing?.images?.[0]?.url) {
          <img [src]="booking.listing.images[0].url" [alt]="booking.listing.title">
        } @else {
          <div class="bk-c-thumb-ph">🏷️</div>
        }
      </div>

      <!-- Main Info -->
      <div class="bk-c-body">
        <div class="bk-c-top">
          <a [routerLink]="['/listings', booking.listing?._id]" class="bk-c-title">
            {{ booking.listing?.title || 'Listing' }}
          </a>
          <span class="bk-c-status" [class]="statusClass">{{ booking.status | titlecase }}</span>
        </div>

        <!-- Dates -->
        <div class="bk-c-meta">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg>
          {{ booking.startDate | date:'mediumDate' }} → {{ booking.endDate | date:'mediumDate' }}
          <span class="bk-c-days">({{ booking.totalDays }} days)</span>
        </div>

        <!-- Party -->
        <div class="bk-c-party">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          @if (isOwner) {
            Renter: <span class="bk-c-name">{{ booking.renter?.name }}</span>
          } @else {
            Owner: <span class="bk-c-name">{{ booking.owner?.name }}</span>
          }
        </div>

        <!-- Amount + Actions -->
        <div class="bk-c-footer">
          <div class="bk-c-amount">
            Rs. {{ booking.totalAmount | number:'1.0-0' }}
            <span class="bk-c-total">total</span>
          </div>

          <div class="bk-c-actions">
            <a [routerLink]="['/bookings', booking._id]" class="bk-c-btn bk-c-btn-view">View</a>

            <button class="bk-c-icon-btn" [matTooltip]="isOwner ? 'Message Renter' : 'Message Owner'" (click)="onMessage()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>

            @if (isOwner && booking.status === 'pending') {
              <button class="bk-c-btn bk-c-btn-accept" (click)="confirm.emit(booking._id)">Accept</button>
              <button class="bk-c-btn bk-c-btn-danger" (click)="reject.emit(booking)">Reject</button>
            }
            @if (isOwner && ['confirmed','active'].includes(booking.status)) {
              <button class="bk-c-btn bk-c-btn-accept" (click)="complete.emit(booking._id)">Mark Complete</button>
            }
            @if (!isOwner && ['pending','confirmed'].includes(booking.status)) {
              <button class="bk-c-btn bk-c-btn-danger" (click)="cancel.emit(booking)">Cancel</button>
            }
            @if (isOwner && ['pending','confirmed'].includes(booking.status)) {
              <button class="bk-c-btn bk-c-btn-danger" (click)="cancel.emit(booking)">Cancel</button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bk-c {
      display:flex; gap:14px; background:#fff; border:1.5px solid #e8efe8;
      border-radius:16px; padding:14px; box-shadow:0 1px 6px rgba(0,0,0,.04);
      transition:box-shadow .2s, transform .2s;
      font-family:'Poppins','Inter',system-ui,sans-serif;
    }
    .bk-c:hover { box-shadow:0 8px 24px rgba(0,0,0,.09); transform:translateY(-2px); }

    .bk-c-thumb { width:64px; height:64px; border-radius:12px; overflow:hidden; flex-shrink:0; background:#f3f4f6; }
    .bk-c-thumb img { width:100%; height:100%; object-fit:cover; }
    .bk-c-thumb-ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:24px; }

    .bk-c-body { flex:1; min-width:0; }
    .bk-c-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:5px; }
    .bk-c-title { font-size:14.5px; font-weight:700; color:#111827; text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .bk-c-title:hover { color:#1F5435; }
    .bk-c-status { padding:3px 10px; border-radius:999px; font-size:10px; font-weight:700; flex-shrink:0; white-space:nowrap; }

    .bk-c-meta, .bk-c-party { display:flex; align-items:center; gap:5px; font-size:12.5px; color:#6b7280; margin-bottom:3px; }
    .bk-c-meta svg, .bk-c-party svg { flex-shrink:0; }
    .bk-c-days { color:#9ca3af; }
    .bk-c-name { color:#111827; font-weight:600; }

    .bk-c-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; flex-wrap:wrap; }
    .bk-c-amount { font-size:17px; font-weight:800; color:#111827; }
    .bk-c-total { font-size:11px; font-weight:400; color:#9ca3af; margin-left:3px; }

    .bk-c-actions { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .bk-c-btn {
      padding:7px 14px; border-radius:9px; font-size:12px; font-weight:700;
      cursor:pointer; border:none; font-family:inherit; text-decoration:none;
      display:inline-flex; align-items:center; transition:all .15s;
    }
    .bk-c-btn:hover { transform:translateY(-1px); }
    .bk-c-btn-view { background:#fff; color:#1F5435; border:1.5px solid #d3e6c2; }
    .bk-c-btn-view:hover { background:#f7fcf4; }
    .bk-c-btn-accept { background:#1F5435; color:#fff; }
    .bk-c-btn-accept:hover { background:#143524; }
    .bk-c-btn-danger { background:#fff; color:#dc2626; border:1.5px solid #fecaca; }
    .bk-c-btn-danger:hover { background:#fef2f2; }
    .bk-c-icon-btn {
      width:32px; height:32px; border-radius:9px; border:1.5px solid #e5e7eb;
      background:#fff; color:#1F5435; cursor:pointer; display:flex;
      align-items:center; justify-content:center; transition:all .15s;
    }
    .bk-c-icon-btn:hover { background:#f7fcf4; border-color:#1F5435; }

    /* Status colors */
    .status-pending   { background:#fef3c7; color:#d97706; }
    .status-confirmed { background:#dbeafe; color:#2563eb; }
    .status-active    { background:#ede9fe; color:#7c3aed; }
    .status-completed { background:#EAF3DE; color:#1F5435; }
    .status-delivered { background:#d1fae5; color:#059669; }
    .status-cancelled { background:#fee2e2; color:#dc2626; }
    .status-rejected  { background:#fee2e2; color:#dc2626; }
  `],
})
export class BookingCardComponent {
  @Input() booking!: any;
  @Input() isOwner  = false;

  @Output() confirm  = new EventEmitter<string>();
  @Output() reject   = new EventEmitter<any>();
  @Output() cancel   = new EventEmitter<any>();
  @Output() complete = new EventEmitter<string>();

  constructor(private router: Router) {}

  // Open chat with the other party (renter sees owner, owner sees renter)
  onMessage(): void {
    const other = this.isOwner ? this.booking?.renter : this.booking?.owner;
    const userId    = other?._id || other?.id || other;
    const listingId = this.booking?.listing?._id || this.booking?.listing?.id || this.booking?.listing;
    if (!userId) return;
    this.router.navigate(['/messages'], { queryParams: { userId, listingId } });
  }

  get statusClass(): string {
    return 'status-' + (this.booking?.status || 'pending');
  }
}
