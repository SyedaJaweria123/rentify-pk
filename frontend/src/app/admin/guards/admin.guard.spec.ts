import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { adminGuard } from './admin.guard';
import { AuthService } from '../../services/auth.service';

/**
 * Unit tests for the functional `adminGuard` (CanActivateFn).
 *
 * NOTE: the real guard redirects a non-admin (logged-in) user to '/dashboard',
 * not '/home'. These tests assert the actual behaviour of the codebase.
 */
describe('adminGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', [], {
      isLoggedIn: true,
      currentUser: null,
    });
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  const runGuard = () =>
    TestBed.runInInjectionContext(() => adminGuard(dummyRoute, dummyState));

  const setUser = (user: any) =>
    Object.defineProperty(authServiceSpy, 'currentUser', { get: () => user });

  it('should allow a logged-in admin user to activate the route', () => {
    Object.defineProperty(authServiceSpy, 'isLoggedIn', { get: () => true });
    setUser({ id: 'u1', role: 'admin' });

    const result = runGuard();

    expect(result).toBeTrue();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('should redirect a non-admin user away from the admin area', () => {
    Object.defineProperty(authServiceSpy, 'isLoggedIn', { get: () => true });
    setUser({ id: 'u2', role: 'renter' });

    const result = runGuard();

    expect(result).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should redirect a logged-out user to /auth/login', () => {
    Object.defineProperty(authServiceSpy, 'isLoggedIn', { get: () => false });
    setUser(null);

    const result = runGuard();

    expect(result).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
