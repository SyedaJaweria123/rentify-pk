import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn) return true;
  router.navigate(['/auth/login']);
  return false;
};

export const ownerGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) { router.navigate(['/auth/login']); return false; }
  if (!auth.isOwner)    { router.navigate(['/dashboard']);  return false; }
  return true;
};

export const renterGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn && !auth.isOwner) return true;
  router.navigate(['/dashboard']);
  return false;
};

export const guestGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) return true;
  router.navigate(['/dashboard']);
  return false;
};

export const riderGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) { router.navigate(['/auth/login']); return false; }
  if (String(auth.currentUser?.role || '') !== 'rider') { router.navigate(['/dashboard']); return false; }
  return true;
};
