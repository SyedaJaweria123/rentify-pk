import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './admin-login.component.html',
  styleUrls:   ['./admin-login.component.css'],
})
export class AdminLoginComponent implements OnInit {
  form!:       FormGroup;
  loading      = false;
  loginError   = '';
  showPassword = false;

  constructor(
    private fb:     FormBuilder,
    private http:   HttpClient,
    private auth:   AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Already logged in as admin → redirect
    const user = this.auth.currentUser as any;
    if (this.auth.isLoggedIn && ['admin', 'super_admin', 'manager', 'support'].includes(user?.role)) {
      this.router.navigate(['/admin']);
      return;
    }

    this.form = this.fb.group({
      email:    ['admin@rentify.pk', [Validators.required, Validators.email]],
      password: ['Admin@1234',       Validators.required],
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.loading) return;
    this.loading    = true;
    this.loginError = '';

    const { email, password } = this.form.value;

    this.http.post(`${environment.apiUrl}/auth/login`, { email, password }).subscribe({
      next: (res: any) => {
        if (!res.success) {
          this.loginError = res.message || 'Login failed';
          this.loading    = false;
          return;
        }

        const user       = res.data?.user;
        const adminRoles = ['admin', 'super_admin', 'manager', 'support'];

        if (!adminRoles.includes(user?.role)) {
          this.loginError = 'Access denied. This account does not have admin privileges. Role: ' + user?.role;
          this.loading    = false;
          return;
        }

        this.auth.setSession(res.data);
        this.loading = false;
        this.router.navigate(['/admin']);
      },
      error: (err: any) => {
        // Show exact backend error
        const msg = err.error?.message || err.message || 'Server error';
        const code = err.error?.code || '';
        this.loginError = code ? `${msg} (${code})` : msg;
        this.loading    = false;
        console.error('Login error:', err.error);
      },
    });
  }
}
