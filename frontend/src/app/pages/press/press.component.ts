import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PublicSettingsService } from '../../core/services/public-settings.service';

@Component({
  selector: 'app-press',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './press.component.html',
  styleUrls: ['./press.component.css'],
})
export class PressComponent {
  constructor(public settings: PublicSettingsService) {
    if (!this.settings.loaded()) this.settings.load();
  }
}
