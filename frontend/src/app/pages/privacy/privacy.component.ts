import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PublicSettingsService } from '../../core/services/public-settings.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.css'],
})
export class PrivacyComponent {
  lastUpdated = 'July 2026';
  constructor(public settings: PublicSettingsService) {
    if (!this.settings.loaded()) this.settings.load();
  }
}
