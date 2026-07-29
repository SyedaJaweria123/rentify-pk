import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.css']
})
export class VerifyEmailComponent implements OnInit {
  state: 'loading' | 'success' | 'expired' | 'invalid' | 'already' = 'loading';
  message = '';
  showResend = false;
  resendEmail = '';
  resending = false;
  resendMsg = '';
  resendError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state = 'invalid';
      this.message = 'No verification token found in the link.';
      return;
    }

    this.auth.verifyEmail(token).subscribe({
      next: (res: any) => {
        if (res.alreadyVerified) { this.state = 'already'; }
        else { this.state = 'success'; }
        this.message = res.message;
        if (this.state === 'success' || this.state === 'already') {
          setTimeout(() => this.router.navigate(['/auth/login']), 4000);
        }
      },
      error: (err: any) => {
        const code = err.error?.code;
        this.message = err.error?.message || 'Verification failed.';
        if (code === 'LINK_EXPIRED') this.state = 'expired';
        else this.state = 'invalid';
      }
    });
  }

  goLogin() { this.router.navigate(['/auth/login']); }

  resend() {
    if (!this.resendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.resendEmail)) {
      this.resendError = 'Please enter a valid email address.';
      return;
    }
    this.resending = true; this.resendError = ''; this.resendMsg = '';
    this.auth.resendVerification(this.resendEmail).subscribe({
      next: (res: any) => { this.resending = false; this.resendMsg = res.message; },
      error: (err: any) => { this.resending = false; this.resendError = err.error?.message || 'Failed. Try again.'; }
    });
  }
}
