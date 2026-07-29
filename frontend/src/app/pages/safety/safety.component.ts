import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PublicSettingsService } from '../../core/services/public-settings.service';

@Component({
  selector: 'app-safety',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './safety.component.html',
  styleUrls: ['./safety.component.css'],
})
export class SafetyComponent {
  constructor(public settings: PublicSettingsService) {
    if (!this.settings.loaded()) this.settings.load();
  }

  readonly renterTips = [
    { icon: '🪪', title: 'Check verification badges', text: "Prefer owners with CNIC verification and a visible trust badge (Bronze/Silver/Gold) — these reflect a real track record on the platform." },
    { icon: '💬', title: 'Keep chat in-app', text: 'Ask questions and confirm details through Rentify PK chat, so there\'s a record if anything needs to be resolved later.' },
    { icon: '📸', title: 'Document the item at delivery', text: 'Use the delivery inspection step to photograph the item\'s condition before you accept it — this protects both you and the owner.' },
    { icon: '💳', title: 'Pay through the app only', text: "Never pay an owner directly outside the app — in-app payments are what make escrow protection and dispute resolution possible." },
  ];

  readonly ownerTips = [
    { icon: '📝', title: 'Be accurate in your listing', text: 'Clear photos and an honest description reduce disputes and lead to better reviews.' },
    { icon: '🔒', title: 'Set a fair security deposit', text: 'A reasonable deposit protects you against damage while keeping your listing attractive to renters.' },
    { icon: '🛵', title: 'Use tracked delivery when possible', text: "Rider-assisted delivery gives you GPS tracking and a handover code, adding a layer of accountability." },
    { icon: '⭐', title: 'Review renters honestly', text: 'Your reviews help other owners make informed decisions — and encourage respectful use of shared items.' },
  ];
}
