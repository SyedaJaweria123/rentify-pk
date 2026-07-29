import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-social-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cb-wrap">
      <div class="cb-card">
        <div class="spinner"></div>
        <p class="cb-msg">{{ message }}</p>
        <p *ngIf="error" class="cb-err">{{ error }}</p>
      </div>
    </div>
  `,
  styles: [`
    .cb-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0a0a0f; }
    .cb-card  { text-align:center; padding:48px 32px; }
    .spinner  { width:48px; height:48px; border:3px solid #1e293b; border-top-color:#6366f1; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 24px; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .cb-msg   { color:#94a3b8; font-size:15px; }
    .cb-err   { color:#f87171; margin-top:12px; font-size:13px; }
  `]
})
export class SocialCallbackComponent implements OnInit {
  message = 'Logging you in...';
  error = '';

  constructor(private route: ActivatedRoute, private router: Router, private auth: AuthService) {}

  ngOnInit() {
    const token   = this.route.snapshot.queryParamMap.get('token');
    const refresh = this.route.snapshot.queryParamMap.get('refresh');
    const err     = this.route.snapshot.queryParamMap.get('error');

    if (err) {
      const msgs: Record<string,string> = {
        google_not_configured:   'Google login is not configured yet.',
        facebook_not_configured: 'Facebook login is not configured yet.',
        google_failed:           'Google login failed. Please try again.',
        facebook_failed:         'Facebook login failed. Please try again.',
        server_error:            'Server error. Please try again.',
      };
      this.error = msgs[err] || 'Login failed.';
      this.message = 'Redirecting...';
      setTimeout(() => this.router.navigate(['/auth/login']), 3000);
      return;
    }

    if (!token || !refresh) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.auth.handleSocialCallback(token, refresh).subscribe({
      next: () => { this.message = 'Welcome! Redirecting...'; this.router.navigate(['/dashboard']); },
      error: ()  => { this.error = 'Could not load profile. Please login again.'; setTimeout(() => this.router.navigate(['/auth/login']), 2000); }
    });
  }
}
