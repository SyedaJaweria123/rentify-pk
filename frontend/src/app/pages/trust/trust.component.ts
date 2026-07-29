import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PublicSettingsService } from '../../core/services/public-settings.service';

@Component({
  selector: 'app-trust',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './trust.component.html',
  styleUrls: ['./trust.component.css'],
})
export class TrustComponent {
  constructor(public settings: PublicSettingsService) {
    if (!this.settings.loaded()) this.settings.load();
  }

  readonly pillars = [
    { icon: '🪪', title: 'CNIC Verification', text: 'Every owner verifies their identity with a CNIC photo and a live selfie match before their listings go live — reducing fake accounts and impersonation.' },
    { icon: '🔒', title: 'Escrow Payments', text: 'Your payment is held securely and only released to the owner once the rental period is confirmed complete — never handed over upfront with no protection.' },
    { icon: '⭐', title: 'Trust Scores & Badges', text: 'Owners and riders earn Bronze, Silver, or Gold badges based on their real booking history and reviews — not a paid ranking.' },
    { icon: '📸', title: 'Delivery Inspections', text: 'Photos are captured at both delivery and return, so any damage claim is backed by a clear, timestamped record from both sides.' },
    { icon: '🛵', title: 'Live Delivery Tracking', text: 'Rider-assisted deliveries include real-time GPS tracking and a handover verification code, so you always know where your item is.' },
    { icon: '⚖️', title: 'Fair Dispute Resolution', text: 'If something goes wrong, either party can open a dispute with evidence — our team reviews both sides before deciding on refunds or deductions.' },
  ];
}
