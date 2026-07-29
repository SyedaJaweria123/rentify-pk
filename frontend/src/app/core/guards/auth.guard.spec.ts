import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from '../../services/auth.service';

/**
 * Unit tests for the functional `authGuard` (CanActivateFn).
 * Functional guards must be executed inside an injection context, so we use
 * TestBed.runInInjectionContext to run them with mocked AuthService + Router.
 */
describe('authGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  // Dummy route args — the guard ignores them but CanActivateFn requires them.
  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;

  beforeEach(() => {
    // Spy on isLoggedIn (a getter) and Router.navigate
    authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', [], {
      isLoggedIn: false,
    });
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  // Helper that runs the functional guard inside Angular's injection context
  const runGuard = () =>
    TestBed.runInInjectionContext(() => authGuard(dummyRoute, dummyState));

  it('should allow a logged-in user to activate the route', () => {
    // Re-define the getter to return true for this test
    Object.defineProperty(authServiceSpy, 'isLoggedIn', { get: () => true });

    const result = runGuard();

    expect(result).toBeTrue();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('should redirect a logged-out user to /auth/login and block activation', () => {
    Object.defineProperty(authServiceSpy, 'isLoggedIn', { get: () => false });

    const result = runGuard();

    expect(result).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
