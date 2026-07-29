import { Injectable, signal } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

/**
 * RouteProgressService — Rentify PK
 * Tracks router navigation to show/hide the top progress bar.
 */
@Injectable({ providedIn: 'root' })
export class RouteProgressService {
  // 0 = hidden, 1–100 = % progress
  readonly progress = signal<number>(0);
  readonly visible  = signal<boolean>(false);

  private timer: any;

  constructor(private router: Router) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.start();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.complete();
      }
    });
  }

  private start(): void {
    clearTimeout(this.timer);
    this.visible.set(true);
    this.progress.set(20);
    // Simulate progress increments
    this.timer = setTimeout(() => this.progress.set(50), 100);
    this.timer = setTimeout(() => this.progress.set(75), 300);
  }

  private complete(): void {
    this.progress.set(100);
    // Hide after completion animation
    setTimeout(() => {
      this.visible.set(false);
      this.progress.set(0);
    }, 400);
  }
}

/**
 * RouteProgressBarComponent — Rentify PK
 * YouTube-style top progress bar that shows during route changes.
 * Add to AppComponent template once:
 *   <app-route-progress-bar></app-route-progress-bar>
 */
@Component({
  selector: 'app-route-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="route-progress-bar"
      *ngIf="routeProgress.visible()"
      [style.width.%]="routeProgress.progress()"
      [class.completing]="routeProgress.progress() === 100">
    </div>
  `,
  styles: [`
    .route-progress-bar {
      position: fixed;
      top: 0; left: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--color-primary, #6C63FF), var(--color-accent, #FF6B6B));
      z-index: 9999;
      transition: width 0.25s ease;
      border-radius: 0 2px 2px 0;
      box-shadow: 0 0 8px rgba(108, 99, 255, 0.6);
    }
    .completing {
      transition: width 0.2s ease, opacity 0.3s ease 0.1s !important;
      opacity: 0;
    }
  `],
})
export class RouteProgressBarComponent {
  constructor(public routeProgress: RouteProgressService) {}
}
