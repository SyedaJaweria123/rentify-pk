import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

type Step = 'email'|'otp'|'reset'|'done';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  step: Step = 'email';
  email=''; otp=''; password=''; confirmPass='';
  showPass=false; showConfirm=false;
  loading=false; error=''; success='';
  fieldErrors: Record<string,string> = {};
  otpDigits = ['','','','','',''];
  otpSingle = '';
  countdown = 0; countdownTimer: any;
  voiceActive = false;

  private voiceMap: Record<Step,string> = {
    email: 'Enter your registered email address to receive a reset code.',
    otp:   'Check your email and enter the 6-digit OTP code sent to you.',
    reset: 'Create your new password. Minimum 6 characters.',
    done:  'Your password has been reset successfully. You can now login.',
  };

  constructor(private auth: AuthService) {}

  sendOTP() {
    this.error = ''; this.fieldErrors = {};
    if (!this.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.email)) {
      this.fieldErrors['email'] = 'Enter a valid email address'; return;
    }
    this.loading = true;
    this.auth.forgotPassword(this.email).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.success = res.message;
        this.step = 'otp';
        this.startCountdown(60);
        if (this.voiceActive) this.speak(this.voiceMap['otp']);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed. Try again.';
        if (this.voiceActive) this.speak(this.error);
      }
    });
  }

  get otpValue(): string { return this.otpSingle; }

  onOtpSingleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    // Only digits, max 6
    this.otpSingle = input.value.replace(/\D/g, '').slice(0, 6);
    input.value = this.otpSingle;
  }

  onOtpInput(i: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '').slice(0, 1);
    this.otpDigits[i] = val;
    input.value = val;
    if (val && i < 5) {
      const next = document.getElementById('otp-' + (i + 1)) as HTMLInputElement;
      if (next) { next.focus(); next.select(); }
    }
  }

  onOtpKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !this.otpDigits[i] && i > 0) {
      const prev = document.getElementById('otp-' + (i-1));
      if (prev) (prev as HTMLInputElement).focus();
    }
  }

  verifyOTP() {
    this.error = '';
    if (this.otpSingle.length !== 6) {
      this.error = 'Please enter all 6 digits.';
      if (this.voiceActive) this.speak(this.error);
      return;
    }
    this.loading = true;
    this.auth.verifyOTP(this.email, this.otpSingle).subscribe({
      next: (res: any) => {
        this.loading = false; this.step = 'reset';
        if (this.voiceActive) this.speak(this.voiceMap['reset']);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Wrong OTP.';
        if (this.voiceActive) this.speak(this.error);
        if (err.error?.code === 'OTP_EXPIRED' || err.error?.code === 'OTP_MAX_ATTEMPTS') {
          this.step = 'email'; this.otpDigits = ['','','','','',''];
        }
      }
    });
  }

  resetPassword() {
    this.error = ''; this.fieldErrors = {};
    if (!this.password || this.password.length < 6) { this.fieldErrors['password'] = 'Password must be at least 6 characters'; return; }
    if (this.password !== this.confirmPass) { this.fieldErrors['confirmPass'] = 'Passwords do not match'; return; }
    this.loading = true;
    this.auth.resetPassword({ email: this.email, password: this.password, confirmPassword: this.confirmPass }).subscribe({
      next: (res: any) => {
        this.loading = false; this.step = 'done';
        if (this.voiceActive) this.speak(this.voiceMap['done']);
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to reset password.';
        if (this.voiceActive) this.speak(this.error);
      }
    });
  }

  resendOTP() {
    this.otpDigits = ['','','','','',''];
    this.otpSingle = '';
    this.step = 'email'; this.error = '';
  }

  startCountdown(secs: number) {
    this.countdown = secs;
    clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) clearInterval(this.countdownTimer);
    }, 1000);
  }

  speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  toggleVoice() {
    this.voiceActive = !this.voiceActive;
    if (this.voiceActive) this.speak(this.voiceMap[this.step]);
    else window.speechSynthesis.cancel();
  }
}