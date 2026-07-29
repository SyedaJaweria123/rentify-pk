// src/app/admin/guards/admin.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn) {
    router.navigate(['/auth/login']);
    return false;
  }

  const user = auth.currentUser as any;
  const adminRoles = ['super_admin', 'admin', 'manager', 'support'];

  if (!adminRoles.includes(user?.role) && user?.role !== 'owner') {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

export const superAdminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const user = auth.currentUser as any;
  if (user?.role !== 'super_admin' && user?.role !== 'admin') {
    router.navigate(['/admin']);
    return false;
  }
  return true;
};
