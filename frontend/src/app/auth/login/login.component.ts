/**
 * LoginComponent — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Design: Split-screen — left green brand panel, right login form
 *
 * Features (all preserved from original):
 *   • Email + password login via AuthService.login()
 *   • Show/hide password toggle
 *   • Field-level validation errors
 *   • EMAIL_NOT_VERIFIED handling → shows resend link
 *   • Social login (Google / Facebook)
 *   • Social-error query param handling
 *   • returnUrl support → redirect back after login
 *   • Already-logged-in guard → redirect to dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector:    'app-login',
  standalone:  true,
  imports:     [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls:   ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy {

  // ── Form fields ─────────────────────────────────────────────────────────
  email    = '';
  password = '';
  showPass = false;
  rememberMe = false;

  // ── UI state ────────────────────────────────────────────────────────────
  loading = false;
  error   = '';
  /** Per-field validation errors keyed by field name */
  fieldErrors: Record<string, string> = {};
  /** Set when login fails with EMAIL_NOT_VERIFIED — enables resend link */
  unverifiedEmail = '';

  // ── Device biometric login ─────────────────────────────────────────────
  biometricSupported = false;
  biometricLoading = false;
  biometricError = '';

  /** URL to return to after successful login (e.g. from booking flow) */
  private returnUrl = '/dashboard';

  // ── Voice Guide (same speechSynthesis pattern as the register page) ────
  voiceActive = false;
  voiceSupported = 'speechSynthesis' in window;
  private voiceMap: Record<string, string> = {
    page:     'Welcome back. Login to continue your rental journey. Enter your email or phone, then your password.',
    email:    'Email or Phone field. Enter the email or phone number you used to sign up.',
    password: 'Password field. Enter your account password.',
  };

  constructor(
    private auth:   AuthService,
    private router: Router,
    private route:  ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // Already logged in? Skip the login page — send them to the right place.
    if (this.auth.isLoggedIn) {
      this.redirectByRole();
      return;
    }

    this.auth.webauthnSupported().then(supported => { this.biometricSupported = supported; });

    // Capture returnUrl so we can redirect back after login
    const ret = this.route.snapshot.queryParamMap.get('returnUrl');
    if (ret) this.returnUrl = ret;

    // Show a friendly message if a social login attempt failed
    const err = this.route.snapshot.queryParamMap.get('error');
    if (err) {
      const msgs: Record<string, string> = {
        google_not_configured:   'Google login is not set up yet.',
        facebook_not_configured: 'Facebook login is not set up yet.',
        google_failed:           'Google sign-in failed. Please try again.',
        facebook_failed:         'Facebook sign-in failed. Please try again.',
      };
      this.error = msgs[err] || 'Social login failed.';
    }
  }

  /** Route the logged-in user to the correct place based on their role. */
  private redirectByRole(): void {
    const role = String(this.auth.currentUser?.role || '');
    if (this.returnUrl && this.returnUrl !== '/dashboard') {
      this.router.navigateByUrl(this.returnUrl);
    } else if (role === 'rider') {
      this.router.navigate(['/rider']);
    } else if (role === 'admin' || role === 'super_admin' || role === 'manager') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  onSubmit(): void {
    this.error = '';
    this.fieldErrors = {};

    // Client-side required-field checks
    if (!this.email)    { this.fieldErrors['email']    = 'Email is required';    return; }
    if (!this.password) { this.fieldErrors['password'] = 'Password is required'; return; }

    this.loading = true;
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.redirectByRole();
      },
      error: (err: any) => {
        this.loading = false;
        const b = err.error || {};
        // Special case: email not verified yet
        if (b.code === 'EMAIL_NOT_VERIFIED') {
          this.error = b.message || 'Please verify your email first.';
          this.unverifiedEmail = b.email || this.email;
        } else {
          this.error = b.message || 'Login failed. Please try again.';
        }
        if (this.voiceActive && this.error) this.speak(this.error);
      },
    });
  }

  // ── Social login ──────────────────────────────────────────────────────────
  loginWithGoogle():   void { window.location.href = this.auth.googleLoginUrl(); }
  loginWithFacebook(): void { window.location.href = this.auth.facebookLoginUrl(); }

  // ── Device biometric login ─────────────────────────────────────────────
  async loginWithBiometric(): Promise<void> {
    this.biometricError = '';
    if (!this.email) { this.fieldErrors['email'] = 'Enter your email first, then use biometric login.'; return; }

    this.biometricLoading = true;
    try {
      await this.auth.loginWithBiometric(this.email);
      this.biometricLoading = false;
      this.redirectByRole();
    } catch (err: any) {
      this.biometricLoading = false;
      // WebAuthnError (e.g. user cancelled the prompt) vs. a server-side
      // rejection both land here — show whichever message is available.
      this.biometricError = err?.message || 'Biometric login failed. Try your password instead.';
    }
  }

  // ── Voice Guide ──────────────────────────────────────────────────────────
  ngOnDestroy(): void { this.stopVoice(); }

  toggleVoice(): void {
    this.voiceActive = !this.voiceActive;
    if (this.voiceActive) this.speak(this.voiceMap['page']);
    else this.stopVoice();
  }
  speakField(key: string): void { if (this.voiceActive) this.speak(this.voiceMap[key] || key); }
  speak(text: string): void {
    if (!this.voiceSupported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.88; u.pitch = 1;
    window.speechSynthesis.speak(u);
  }
  stopVoice(): void { if (this.voiceSupported) window.speechSynthesis.cancel(); }
}
