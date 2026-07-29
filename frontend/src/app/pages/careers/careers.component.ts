import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PublicSettingsService } from '../../core/services/public-settings.service';

@Component({
  selector: 'app-careers',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './careers.component.html',
  styleUrls: ['./careers.component.css'],
})
export class CareersComponent {
  constructor(public settings: PublicSettingsService) {
    if (!this.settings.loaded()) this.settings.load();
  }

  readonly values = [
    { icon: '🚀', title: 'Move Fast',   text: 'We ship, learn from real users, and iterate quickly rather than over-planning.' },
    { icon: '🤝', title: 'Own It',      text: 'Small team, real ownership — everyone\'s work directly shapes the product.' },
    { icon: '🇵🇰', title: 'Built for PK', text: 'We\'re solving a real, local problem — sharing instead of buying, for Pakistan.' },
  ];
}
