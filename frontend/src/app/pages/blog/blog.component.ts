import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Blog "coming soon" page — no fake blog posts. Reuses the real
 * POST /api/newsletter/subscribe endpoint (same one wired into the footer)
 * so visitors can genuinely be notified when the blog launches.
 */
@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.css'],
})
export class BlogComponent {
  email = '';
  error = '';
  subscribed = false;
  subscribing = false;

  constructor(private http: HttpClient) {}

  private validEmail(e: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  notifyMe(): void {
    this.error = '';
    if (!this.email.trim()) { this.error = 'Please enter your email address.'; return; }
    if (!this.validEmail(this.email)) { this.error = 'Please enter a valid email address.'; return; }

    this.subscribing = true;
    this.http.post<any>(`${environment.apiUrl}/newsletter/subscribe`, { email: this.email.trim(), source: 'blog' })
      .subscribe({
        next: () => { this.subscribing = false; this.subscribed = true; this.email = ''; },
        error: (err) => { this.subscribing = false; this.error = err.error?.message || 'Something went wrong.'; },
      });
  }
}
