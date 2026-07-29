import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { SocketService } from '../core/services/socket.service';
import { environment } from '../../environments/environment';
import { TOKEN_KEY, REFRESH_KEY, USER_KEY } from '../models/auth.model';

/**
 * Unit tests for AuthService.
 *  (a) login success → token (and session) saved to localStorage
 *  (b) logout → token cleared from localStorage
 *
 * HttpClientTestingModule is used to mock the backend; SocketService and Router
 * are stubbed so the service can be constructed in isolation.
 */
describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let socketSpy: jasmine.SpyObj<SocketService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockUser = {
    id: 'u1', name: 'Test User', email: 'test@rentify.pk', role: 'renter',
    isEmailVerified: true, isActive: true, walletBalance: 0, createdAt: '2024-01-01',
  };
  const mockLoginResponse = {
    success: true,
    data: { user: mockUser, accessToken: 'access-123', refreshToken: 'refresh-456' },
  };

  beforeEach(() => {
    socketSpy = jasmine.createSpyObj<SocketService>('SocketService', ['connect', 'disconnect']);
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: SocketService, useValue: socketSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();   // assert no unexpected HTTP calls
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should save the access token to localStorage on successful login', () => {
    service.login('test@rentify.pk', 'secret123').subscribe((res) => {
      expect(res.success).toBeTrue();
    });

    // Expect exactly one POST to the login endpoint and flush the mock response
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush(mockLoginResponse);

    // Token + refresh + user should now be in localStorage
    expect(localStorage.getItem(TOKEN_KEY)).toBe('access-123');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-456');
    expect(localStorage.getItem(USER_KEY)).toContain('test@rentify.pk');
    expect(service.isLoggedIn).toBeTrue();
  });

  it('should clear the token from localStorage on logout', () => {
    // Seed a fake session first
    localStorage.setItem(TOKEN_KEY, 'access-123');
    localStorage.setItem(REFRESH_KEY, 'refresh-456');
    localStorage.setItem(USER_KEY, JSON.stringify(mockUser));

    service.logout();

    // logout() fires a best-effort POST /auth/logout — answer it so httpMock is clean
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(socketSpy.disconnect).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });
});
