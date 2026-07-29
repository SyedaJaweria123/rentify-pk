import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { User } from '../../models/auth.model';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';

/**
 * Profile — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by owners and renters (riders have their own dedicated
 * RiderProfileComponent at /rider/profile). Renders inside the matching
 * role's sidebar shell so it feels consistent with the rest of the
 * dashboard rather than a plain standalone page.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, MatSnackBarModule, OwnerLayoutComponent, RenterLayoutComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent implements OnInit {
  user:         User | null = null;
  avatarFile:   File | null = null;
  avatarPreview = '';

  profileForm!:  FormGroup;
  passwordForm!: FormGroup;

  // ── Biometric login ─────────────────────────────────────────────────────
  biometricSupported = false;
  registeringBiometric = false;
  biometricError = '';
  biometricSuccess = '';
  biometricDevices: any[] = [];

  savingProfile   = false;
  changingPassword = false;
  uploadingAvatar = false;

  profileError  = '';
  passwordError = '';

  constructor(
    public  auth:  AuthService,
    private http:  HttpClient,
    private fb:    FormBuilder,
    private snack: MatSnackBar,
  ) {}

  get isOwner(): boolean { return this.auth.isOwner; }

  get memberSince(): string {
    return this.user?.createdAt
      ? new Date(this.user.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'long' })
      : '';
  }

  ngOnInit(): void {
    this.user = this.auth.currentUser;
    this.profileForm = this.fb.group({
      name:  [this.user?.name || '', [Validators.required, Validators.minLength(2)]],
      phone: [this.user?.phone || ''],
      address: [this.user?.address || ''],
    });
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword:     ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    }, { validators: this.passwordMatchValidator });

    // Refresh from server
    this.http.get(`${environment.apiUrl}/auth/me`).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.user = res.data.user;
          this.profileForm.patchValue({ name: this.user?.name, phone: this.user?.phone, address: this.user?.address });
        }
      },
    });

    this.auth.webauthnSupported().then(supported => { this.biometricSupported = supported; });
    this.loadBiometricDevices();
  }

  private loadBiometricDevices(): void {
    this.auth.getWebauthnDevices().subscribe({
      next: (res: any) => { this.biometricDevices = res?.data || []; },
      error: () => { this.biometricDevices = []; },
    });
  }

  async registerThisDevice(): Promise<void> {
    this.biometricError = ''; this.biometricSuccess = '';
    this.registeringBiometric = true;
    try {
      await this.auth.registerBiometric();
      this.registeringBiometric = false;
      this.biometricSuccess = 'Biometric login enabled for this device.';
      this.loadBiometricDevices();
    } catch (err: any) {
      this.registeringBiometric = false;
      this.biometricError = err?.message || 'Could not enable biometric login.';
    }
  }

  removeDevice(credentialId: string): void {
    this.auth.removeWebauthnDevice(credentialId).subscribe({
      next: () => { this.loadBiometricDevices(); },
      error: (err: any) => { this.biometricError = err?.error?.message || 'Could not remove device.'; },
    });
  }

  passwordMatchValidator(group: FormGroup) {
    const np = group.get('newPassword')?.value;
    const cp = group.get('confirmPassword')?.value;
    return np === cp ? null : { mismatch: true };
  }

  onAvatarChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { this.snack.open('Image must be under 5MB', 'Close', { duration: 3000 }); return; }
    this.avatarFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { this.avatarPreview = e.target?.result as string; };
    reader.readAsDataURL(file);
  }

  uploadAvatar(): void {
    if (!this.avatarFile) return;
    this.uploadingAvatar = true;
    const fd = new FormData();
    fd.append('avatar', this.avatarFile);
    this.http.put(`${environment.apiUrl}/auth/profile/avatar`, fd).subscribe({
      next: (res: any) => {
        if (res.success && this.user) {
          this.user = { ...this.user, avatar: res.data.avatar };
          // Update navbar + everywhere instantly
          this.auth.updateUser({ avatar: res.data.avatar });
        }
        this.avatarFile = null;
        this.avatarPreview = '';
        this.uploadingAvatar = false;
        this.snack.open('Photo updated!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.snack.open(err.error?.message || 'Upload failed', 'Close', { duration: 3000 });
        this.uploadingAvatar = false;
      },
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) return;
    this.savingProfile = true;
    this.profileError  = '';
    this.http.put(`${environment.apiUrl}/auth/profile`, this.profileForm.value).subscribe({
      next: (res: any) => {
        if (res.success && this.user) {
          const updated = this.profileForm.value;
          this.user = { ...this.user, ...updated };
          // Update navbar name instantly
          this.auth.updateUser(updated);
        }
        this.savingProfile = false;
        this.snack.open('Profile updated!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.profileError  = err.error?.message || 'Update failed';
        this.savingProfile = false;
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    this.changingPassword = true;
    this.passwordError    = '';
    const { currentPassword, newPassword } = this.passwordForm.value;
    this.http.put(`${environment.apiUrl}/auth/profile/password`, { currentPassword, newPassword }).subscribe({
      next: () => {
        this.changingPassword = false;
        this.passwordForm.reset();
        this.snack.open('Password changed!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.passwordError    = err.error?.message || 'Password change failed';
        this.changingPassword = false;
      },
    });
  }
}
