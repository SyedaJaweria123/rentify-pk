import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { RiderBadgeComponent } from '../../shared/components/rider-badge/rider-badge.component';

@Component({
  selector: 'app-rider-public-profile',
  standalone: true,
  imports: [CommonModule, RiderBadgeComponent],
  template: `
    <div class="min-h-screen bg-gray-50 py-8 px-4">
      <div class="max-w-md mx-auto">

        <!-- Back -->
        <button (click)="goBack()" class="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1F5435] mb-6 font-medium">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
          Back
        </button>

        <!-- Loading -->
        <div *ngIf="loading()" class="flex justify-center py-20">
          <div class="w-10 h-10 border-3 border-[#EAF3DE] border-t-[#1F5435] rounded-full animate-spin" style="border-width:3px"></div>
        </div>

        <!-- Error -->
        <div *ngIf="!loading() && error()" class="text-center py-20 text-gray-400">
          <p>{{ error() }}</p>
        </div>

        <ng-container *ngIf="!loading() && profile()">

          <!-- Hero card -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4 text-center">
            <!-- Avatar -->
            <div class="relative inline-block mb-4">
              <img *ngIf="profile().user.avatar" [src]="profile().user.avatar" alt="rider" class="w-24 h-24 rounded-full object-cover border-3 border-[#EAF3DE] mx-auto" style="border-width:3px"/>
              <div *ngIf="!profile().user.avatar" class="w-24 h-24 rounded-full bg-[#1F5435] flex items-center justify-center text-white text-3xl font-bold mx-auto">
                {{ profile().user.name?.[0] || 'R' }}
              </div>
            </div>

            <h1 class="text-xl font-bold text-gray-900 mb-1">{{ profile().user.name }}</h1>
            <p class="text-sm text-gray-400 mb-3">Rentify Rider</p>

            <!-- Badge -->
            <div class="flex justify-center mb-2" *ngIf="riderRating > 0">
              <app-rider-badge [rating]="riderRating" size="md" [showRating]="true"></app-rider-badge>
            </div>
            <span *ngIf="riderRating === 0" class="inline-block text-xs font-bold px-3 py-1 rounded-full bg-[#EAF3DE] text-[#1F5435]">⭐ New Rider</span>

            <!-- Verified -->
            <div class="mt-3 flex justify-center gap-2" *ngIf="profile().user.cnicVerified">
              <span class="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">✓ CNIC Verified</span>
            </div>
          </div>

          <!-- Stats -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
            <h2 class="text-sm font-bold text-gray-900 mb-3">Stats</h2>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-[#EAF3DE] rounded-xl p-3">
                <p class="text-xl font-black text-[#1F5435]">{{ profile().stats?.totalDeliveries || 0 }}</p>
                <p class="text-xs text-gray-500 mt-0.5">Total Deliveries</p>
              </div>
              <div class="bg-[#EAF3DE] rounded-xl p-3">
                <p class="text-xl font-black text-[#1F5435]">{{ riderRating > 0 ? (riderRating | number:'1.1-1') : '—' }}</p>
                <p class="text-xs text-gray-500 mt-0.5">Rating / 5.0</p>
              </div>
            </div>
          </div>

          <!-- Rating tier strip -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4" *ngIf="riderRating > 0">
            <h2 class="text-sm font-bold text-gray-900 mb-3">Tier</h2>
            <div class="flex items-center">
              <div class="flex flex-col items-center gap-1 flex-1 text-xs" [class.font-bold]="riderRating >= 3.0" [class.text-[#1F5435]]="riderRating >= 3.0" [class.text-gray-300]="riderRating < 3.0">
                <span>🥉</span><span>Bronze</span>
              </div>
              <div class="h-0.5 flex-1 mx-1" [class.bg-[#1F5435]]="riderRating >= 4.0" [class.bg-gray-200]="riderRating < 4.0"></div>
              <div class="flex flex-col items-center gap-1 flex-1 text-xs" [class.font-bold]="riderRating >= 4.0" [class.text-[#1F5435]]="riderRating >= 4.0" [class.text-gray-300]="riderRating < 4.0">
                <span>🥈</span><span>Silver</span>
              </div>
              <div class="h-0.5 flex-1 mx-1" [class.bg-[#1F5435]]="riderRating >= 4.5" [class.bg-gray-200]="riderRating < 4.5"></div>
              <div class="flex flex-col items-center gap-1 flex-1 text-xs" [class.font-bold]="riderRating >= 4.5" [class.text-[#1F5435]]="riderRating >= 4.5" [class.text-gray-300]="riderRating < 4.5">
                <span>🥇</span><span>Gold</span>
              </div>
              <div class="h-0.5 flex-1 mx-1" [class.bg-[#1F5435]]="riderRating >= 4.8" [class.bg-gray-200]="riderRating < 4.8"></div>
              <div class="flex flex-col items-center gap-1 flex-1 text-xs" [class.font-bold]="riderRating >= 4.8" [class.text-[#1F5435]]="riderRating >= 4.8" [class.text-gray-300]="riderRating < 4.8">
                <span>💎</span><span>Platinum</span>
              </div>
            </div>
          </div>

          <!-- Member since -->
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4" *ngIf="profile().user.memberSince">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Member Since</p>
            <p class="font-semibold text-gray-800 mt-0.5">{{ profile().user.memberSince | date:'MMMM yyyy' }}</p>
          </div>

        </ng-container>
      </div>
    </div>
  `,
})
export class RiderPublicProfileComponent implements OnInit {
  loading = signal(true);
  error   = signal('');
  profile = signal<any>(null);

  constructor(
    private route:    ActivatedRoute,
    private router:   Router,
    private location: Location,
    private http:     HttpClient,
  ) {}

  get riderRating(): number { return this.profile()?.user?.riderRating || 0; }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('riderId');
    if (!id) { this.error.set('Invalid rider ID.'); this.loading.set(false); return; }
    this.http.get<any>(`${environment.apiUrl}/auth/public-profile/${id}`).subscribe({
      next:  (res) => { this.profile.set(res?.data || null); this.loading.set(false); },
      error: (err) => { this.error.set(err?.error?.message || 'Could not load profile.'); this.loading.set(false); },
    });
  }

  goBack(): void { this.location.back(); }
}
