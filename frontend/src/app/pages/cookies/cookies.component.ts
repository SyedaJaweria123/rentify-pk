import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PublicSettingsService } from '../../core/services/public-settings.service';

@Component({
  selector: 'app-cookies',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cookies.component.html',
  styleUrls: ['./cookies.component.css'],
})
export class CookiesComponent {
  lastUpdated = 'July 2026';
  constructor(public settings: PublicSettingsService) {
    if (!this.settings.loaded()) this.settings.load();
  }
}
