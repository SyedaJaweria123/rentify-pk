import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { RiderService } from '../rider.service';
import { RiderBadgeComponent, RiderTier } from '../../../shared/components/rider-badge/rider-badge.component';

@Component({
  selector: 'app-rider-profile',
  standalone: true,
  imports: [CommonModule, DatePipe, RiderBadgeComponent],
  templateUrl: './rider-profile.component.html',
  styleUrls: ['./rider-profile.component.css'],
})
export class RiderProfileComponent implements OnInit {
  loading = signal(true);
  earnings = signal<any>(null);

  constructor(public auth: AuthService, private riderSvc: RiderService) {}

  ngOnInit(): void {
    this.riderSvc.getEarnings().subscribe({
      next: (res) => { this.earnings.set(res?.data || null); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  get rider() { return this.auth.currentUser; }
  get rating(): number { return this.rider?.riderRating || 0; }

  // Next tier goal — what rating does the rider need to reach next badge
  nextTierGoal = computed(() => {
    const r = this.rating;
    if (r < 3.0) return { tier: 'Bronze' as RiderTier, needed: 3.0, label: 'Bronze' };
    if (r < 4.0) return { tier: 'Silver' as RiderTier, needed: 4.0, label: 'Silver' };
    if (r < 4.5) return { tier: 'Gold'   as RiderTier, needed: 4.5, label: 'Gold'   };
    if (r < 4.8) return { tier: 'Platinum' as RiderTier, needed: 4.8, label: 'Platinum' };
    return null;   // already Platinum
  });

  tierProgress = computed(() => {
    const r = this.rating;
    const goal = this.nextTierGoal();
    if (!goal) return 100;   // Platinum
    // Progress within the current band
    const bands: Record<string, [number, number]> = {
      Bronze:   [0, 3.0],
      Silver:   [3.0, 4.0],
      Gold:     [4.0, 4.5],
      Platinum: [4.5, 4.8],
    };
    const [lo, hi] = bands[goal.label] || [0, goal.needed];
    return Math.min(100, Math.round(((r - lo) / (hi - lo)) * 100));
  });

  readonly MILESTONES = [
    { count: 15, bonus: 250 },
    { count: 25, bonus: 750 },
    { count: 50, bonus: 1250 },
  ];
}
