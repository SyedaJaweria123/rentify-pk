import {
  Component, OnInit, OnDestroy, HostListener, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { ChatService } from '../../modules/chat/chat.service';
import { NotificationService } from '../../modules/notifications/notification.service';
import { NotificationBellComponent } from '../../modules/notifications/notification-bell.component';
import { CartService } from '../../modules/cart/cart.service';

export interface NavCategory { emoji: string; name: string; slug: string; }

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationBellComponent],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit, OnDestroy {
  private routerSub!: Subscription;
  private authSub!: Subscription;

  // ── UI state signals ────────────────────────────────────────────────────────
  scrolled       = signal(false);
  mobileMenuOpen = signal(false);
  userMenuOpen   = signal(false);
  categoriesOpen = signal(false);
  mobileCatsOpen = signal(false);

  // ── User signals ─────────────────────────────────────────────────────────────
  isLoggedIn    = signal(false);
  showLogoutConfirm = signal(false);
  isOwner       = signal(false);
  isRider       = signal(false);
  userName      = signal('');
  userEmail     = signal('');
  userAvatar    = signal('');
  userInitial   = signal('U');
  walletBalance = signal(0);
  unreadMessages = signal(0);

  // Dark mode comes straight from the ThemeService signal
  get isDark() { return this.theme.isDark; }

  // ── Computed ──────────────────────────────────────────────────────────────────
  firstName = computed(() => this.userName().split(' ')[0] || 'User');

  // Notification unread comes straight from the service signal
  get unreadNotifs() { return this.notifSvc.unreadCount; }

  readonly categories: NavCategory[] = [
    { emoji: 'electronics', name: 'Electronics', slug: 'Electronics' },
    { emoji: 'vehicles',    name: 'Vehicles',    slug: 'Vehicles'    },
    { emoji: 'furniture',   name: 'Furniture',   slug: 'Furniture'   },
    { emoji: 'cameras',     name: 'Cameras',     slug: 'Cameras'     },
    { emoji: 'sports',      name: 'Sports',      slug: 'Sports'      },
    { emoji: 'tools',       name: 'Tools',       slug: 'Tools'       },
    { emoji: 'events',      name: 'Events',      slug: 'Events'      },
  ];

  constructor(
    private auth: AuthService,
    private router: Router,
    private theme: ThemeService,
    private chat: ChatService,
    private notifSvc: NotificationService,
    public  cartSvc: CartService,
  ) {}

  // ── Host listeners ────────────────────────────────────────────────────────────
  @HostListener('window:scroll')
  onScroll(): void { this.scrolled.set(window.scrollY > 10); }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.avatar-wrapper')) this.userMenuOpen.set(false);
    if (!t.closest('.cats-wrapper'))   this.categoriesOpen.set(false);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.syncUser();
    this.loadUnreadMessages();
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => { this.closeMobileMenu(); this.syncUser(); });

    // React to login/logout immediately, even when the route doesn't change
    // (e.g. logging out while already on the home page).
    this.authSub = this.auth.currentUser$.subscribe(() => this.syncUser());
  }

  ngOnDestroy(): void { this.routerSub?.unsubscribe(); this.authSub?.unsubscribe(); this.setBodyScrollLock(false); }

  // Home page → transparent navbar over hero image
  get isHomePage(): boolean { return this.router.url === '/' || this.router.url.split('?')[0] === '/'; }

  // ── Data sync ────────────────────────────────────────────────────────────────
  private syncUser(): void {
    const u = this.auth.currentUser;
    this.isLoggedIn.set(this.auth.isLoggedIn);
    this.isOwner.set(this.auth.isOwner);
    this.isRider.set(String(this.auth.currentUser?.role || '') === 'rider');
    if (u) {
      this.userName.set(u.name || 'User');
      this.userEmail.set(u.email || '');
      this.userAvatar.set((u as any).avatar || '');
      this.userInitial.set((u.name || 'U').charAt(0).toUpperCase());
      this.walletBalance.set(u.walletBalance || 0);
      this.notifSvc.refreshCount();
      this.cartSvc.refreshCount();
    } else {
      this.userName.set(''); this.userEmail.set(''); this.userAvatar.set('');
      this.userInitial.set('U'); this.walletBalance.set(0); this.unreadMessages.set(0);
      this.cartSvc.count.set(0);
      this.cartSvc.closeDrawer();
    }
  }

  loadUnreadMessages(): void {
    if (!this.auth.isLoggedIn) return;
    this.chat.getConversations().subscribe({
      next: (res: any) => {
        const list = res?.data?.conversations || [];
        const total = list.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0);
        this.unreadMessages.set(total);
      },
      error: () => this.unreadMessages.set(0),
    });
  }

  // ── Theme ──────────────────────────────────────────────────────────────────────
  toggleTheme(): void { this.theme.toggle(); }

  // ── Menus ──────────────────────────────────────────────────────────────────────
  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
    this.setBodyScrollLock(this.mobileMenuOpen());
  }
  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
    this.mobileCatsOpen.set(false);
    this.setBodyScrollLock(false);
  }

  /** Locks/unlocks background page scroll while the mobile drawer is open,
   *  matching native app behavior (e.g. Instagram/WhatsApp side menus) so the
   *  page underneath doesn't scroll while the drawer is on top of it. */
  private setBodyScrollLock(locked: boolean): void {
    document.body.style.overflow = locked ? 'hidden' : '';
  }
  toggleUserMenu(): void   { this.userMenuOpen.update(v => !v); }
  closeUserMenu(): void    { this.userMenuOpen.set(false); }

  openCategories(): void   { this.categoriesOpen.set(true); }
  closeCategories(): void  { this.categoriesOpen.set(false); }
  toggleCategories(): void { this.categoriesOpen.update(v => !v); }
  toggleMobileCats(): void { this.mobileCatsOpen.update(v => !v); }

  goToCategory(cat: NavCategory): void {
    this.router.navigate(['/listings'], { queryParams: { category: cat.slug } });
    this.closeCategories();
    this.closeMobileMenu();
  }

  /** Force navigation to the home page (works even from the rider layout). */
  goHome(event?: Event): void {
    event?.preventDefault();
    this.closeMobileMenu();
    this.router.navigateByUrl('/');
  }

  logout(): void {
    this.closeMobileMenu();
    this.closeUserMenu();
    this.showLogoutConfirm.set(true);
  }

  confirmLogout(): void {
    this.showLogoutConfirm.set(false);
    this.auth.logout();
  }

  cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }
}
