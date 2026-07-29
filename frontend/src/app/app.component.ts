import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RouteProgressBarComponent } from './shared/ui/route-progress';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, RouteProgressBarComponent],
  template: `
    <!-- YouTube-style top progress bar — shows on every route change -->
    <app-route-progress-bar></app-route-progress-bar>

    <!-- Main app content -->
    <router-outlet></router-outlet>
  `,
})
export class AppComponent {
  // ThemeService injected here to initialize on app start
  // (reads localStorage and applies correct theme immediately)
  constructor(private theme: ThemeService) {}
}
