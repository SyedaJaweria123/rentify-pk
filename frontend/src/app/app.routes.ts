import { Routes } from '@angular/router';
import { authGuard, guestGuard, riderGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './main-layout/main-layout.component';
import { adminRoutes } from './admin/admin.routes';

export const routes: Routes = [
  // ── Admin (separate layout) ──────────────────────────────────────────────
  ...adminRoutes,

  // ── Notifications (component provides its own role-based sidebar layout) ──
  { path: 'notifications', canActivate: [authGuard], loadComponent: () => import('./modules/notifications/notifications-page.component').then(m => m.NotificationsPageComponent) },

  // ── Notification Detail (Gmail-style single-notification view) ──
  { path: 'notifications/:id', canActivate: [authGuard], loadComponent: () => import('./modules/notifications/notification-detail.component').then(m => m.NotificationDetailComponent) },

  // ── Track (component provides its own role-based sidebar layout) ──
  { path: 'track', canActivate: [authGuard], loadComponent: () => import('./modules/tracking/tracking.component').then(m => m.TrackingComponent) },
  { path: 'dispute/:bookingId', canActivate: [authGuard], loadComponent: () => import('./pages/dispute/dispute.component').then(m => m.DisputeComponent) },

  // ── Add Listing (component provides its own owner sidebar layout) ──
  { path: 'listings/add', canActivate: [authGuard], loadComponent: () => import('./listings/add-listing/add-listing.component').then(m => m.AddListingComponent) },

  // ── Edit Listing (component provides its own owner sidebar layout) ──
  { path: 'listings/edit/:id', canActivate: [authGuard], loadComponent: () => import('./listings/edit-listing/edit-listing.component').then(m => m.EditListingComponent) },

  // ── Owner Earnings Report (component provides its own owner sidebar layout) ──
  { path: 'earnings', canActivate: [authGuard], loadComponent: () => import('./modules/earnings/owner-earnings.component').then(m => m.OwnerEarningsComponent) },

  // ── Owner Reviews (component provides its own owner sidebar layout) ──
  { path: 'reviews', canActivate: [authGuard], loadComponent: () => import('./modules/reviews/owner-reviews.component').then(m => m.OwnerReviewsComponent) },

  // ── Inspections & Proofs (component provides its own owner/renter/rider sidebar layout) ──
  { path: 'inspections', canActivate: [authGuard], loadComponent: () => import('./modules/inspection/my-inspections.component').then(m => m.MyInspectionsComponent) },

  // ── My Reviews (renter — component provides its own renter sidebar layout) ──
  { path: 'my-reviews', canActivate: [authGuard], loadComponent: () => import('./modules/reviews/my-reviews.component').then(m => m.MyReviewsComponent) },

  // ── Bookings list (component provides its own owner/renter sidebar layout) ──
  { path: 'bookings', canActivate: [authGuard], loadComponent: () => import('./modules/bookings/booking-list.component').then(m => m.BookingListComponent) },

  // ── Booking detail (component provides its own owner/renter sidebar layout) ──
  { path: 'bookings/:id', canActivate: [authGuard], loadComponent: () => import('./modules/bookings/booking-detail.component').then(m => m.BookingDetailComponent) },

  // ── My Listings (component provides its own owner sidebar layout) ──
  { path: 'my-listings', canActivate: [authGuard], loadComponent: () => import('./listings/my-listings/my-listings.component').then(m => m.MyListingsComponent) },

  // ── Profile (component provides its own owner/renter sidebar layout; riders use /rider/profile instead) ──
  { path: 'profile', canActivate: [authGuard], loadComponent: () => import('./modules/profile/profile.component').then(m => m.ProfileComponent) },

  // ── Wallet (component provides its own owner/renter sidebar layout; riders reach it via /rider/wallet, already wrapped) ──
  { path: 'wallet', canActivate: [authGuard], loadComponent: () => import('./modules/wallet/wallet.component').then(m => m.WalletComponent) },

  // ── Rider (separate layout — own sidebar+topbar, not the main navbar) ────
  { path: 'rider', canActivate: [riderGuard], loadComponent: () => import('./modules/rider/rider-layout.component').then(m => m.RiderLayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',        loadComponent: () => import('./modules/rider/rider-dashboard.component').then(m => m.RiderDashboardComponent) },
      { path: 'deliveries',       loadComponent: () => import('./modules/rider/rider-deliveries.component').then(m => m.RiderDeliveriesComponent) },
      { path: 'pending-returns',  loadComponent: () => import('./modules/rider/rider-pending-returns.component').then(m => m.RiderPendingReturnsComponent) },
      { path: 'earnings',         loadComponent: () => import('./modules/rider/rider-earnings.component').then(m => m.RiderEarningsComponent) },
      { path: 'performance',      loadComponent: () => import('./modules/rider/rider-performance.component').then(m => m.RiderPerformanceComponent) },
      { path: 'reviews',          loadComponent: () => import('./modules/reviews/rider-reviews.component').then(m => m.RiderReviewsComponent) },
      { path: 'profile',          loadComponent: () => import('./modules/rider/rider-profile/rider-profile.component').then(m => m.RiderProfileComponent) },
      // Same shared components as the top-level /wallet, /support, /notifications
      // routes below — duplicated here so riders get them inside the sidebar shell.
      { path: 'wallet',  loadComponent: () => import('./modules/wallet/wallet.component').then(m => m.WalletComponent) },
      { path: 'support', loadComponent: () => import('./modules/support/my-support.component').then(m => m.MySupportComponent) },
      { path: 'scan',    loadComponent: () => import('./modules/rider/rider-qr-scan.component').then(m => m.RiderQrScanComponent) },
    ]},

  // ── Main App Layout ──────────────────────────────────────────────────────
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent),
        children: [
          { path: 'auth/login', loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent),
            children: [
              { path: 'forgot-password', loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
            ]
          },
          { path: 'auth/register', loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent) },
        ]
      },
      { path: 'listings', loadComponent: () => import('./listings/browse-listings/browse-listings.component').then(m => m.BrowseListingsComponent) },
      { path: 'owner/:id', loadComponent: () => import('./listings/owner-profile/owner-profile.component').then(m => m.OwnerProfileComponent) },
      { path: 'listings/:id', loadComponent: () => import('./listings/listing-detail/listing-detail.component').then(m => m.ListingDetailComponent) },
      { path: 'auth/login',    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent),
        children: [
          { path: 'forgot-password', loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
        ]
      },
      { path: 'auth/register', loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent) },
      { path: 'auth/forgot-password', loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
      { path: 'auth/verify-email', loadComponent: () => import('./auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent) },
      { path: 'auth/social-callback', loadComponent: () => import('./auth/social-callback/social-callback.component').then(m => m.SocialCallbackComponent) },
      { path: 'dashboard',     canActivate: [authGuard], loadComponent: () => import('./modules/dashboard/dashboard-router.component').then(m => m.DashboardRouterComponent) },
      { path: 'bookings/:id/review', canActivate: [authGuard], loadComponent: () => import('./modules/bookings/booking-review.component').then(m => m.BookingReviewComponent) },
      { path: 'payment/checkout/:bookingId', canActivate: [authGuard], loadComponent: () => import('./modules/payment/payment-checkout.component').then(m => m.PaymentCheckoutComponent) },
      { path: 'payment/status/:bookingId',   canActivate: [authGuard], loadComponent: () => import('./modules/payment/payment-status.component').then(m => m.PaymentStatusComponent) },
      { path: 'payment/bank-proof/:bookingId', canActivate: [authGuard], loadComponent: () => import('./modules/payment/bank-transfer-proof.component').then(m => m.BankTransferProofComponent) },
      { path: 'damage-claim/new/:bookingId', canActivate: [authGuard], loadComponent: () => import('./modules/damage-claim/damage-claim-create.component').then(m => m.DamageClaimCreateComponent) },
      { path: 'damage-claim/:claimId',       canActivate: [authGuard], loadComponent: () => import('./modules/damage-claim/damage-claim-detail.component').then(m => m.DamageClaimDetailComponent) },
      { path: 'rider-public/:riderId', canActivate: [authGuard], loadComponent: () => import('./pages/rider-public-profile/rider-public-profile.component').then(m => m.RiderPublicProfileComponent) },
      { path: 'inspection/compare/:bookingId', canActivate: [authGuard], loadComponent: () => import('./modules/inspection/inspection-comparison.component').then(m => m.InspectionComparisonComponent) },
      { path: 'inspection/leg/:type/:bookingId', canActivate: [authGuard], loadComponent: () => import('./modules/inspection/inspection-leg.component').then(m => m.InspectionLegComponent) },
      { path: 'inspection/:type/:bookingId', canActivate: [authGuard], loadComponent: () => import('./modules/inspection/inspection-submit.component').then(m => m.InspectionSubmitComponent) },
      { path: 'rider/deliver/:id', canActivate: [riderGuard], loadComponent: () => import('./modules/rider/rider-deliver.component').then(m => m.RiderDeliverComponent) },
      { path: 'messages',      canActivate: [authGuard], loadComponent: () => import('./modules/chat/chat.component').then(m => m.ChatComponent) },
      { path: 'messages/:id',  canActivate: [authGuard], loadComponent: () => import('./modules/chat/chat.component').then(m => m.ChatComponent) },
      { path: 'verify-cnic',   canActivate: [authGuard], loadComponent: () => import('./modules/cnic/cnic-verification.component').then(m => m.CnicVerificationComponent) },
      { path: 'wishlist',      canActivate: [authGuard], loadComponent: () => import('./modules/wishlist/wishlist-page.component').then(m => m.WishlistPageComponent) },
      { path: 'cart/checkout', canActivate: [authGuard], loadComponent: () => import('./modules/cart/cart.component').then(m => m.CartComponent) },
      { path: 'support',       canActivate: [authGuard], loadComponent: () => import('./modules/support/my-support.component').then(m => m.MySupportComponent) },
      { path: 'my-tickets',     canActivate: [authGuard], loadComponent: () => import('./modules/support/my-support.component').then(m => m.MySupportComponent) },
      { path: 'my-tickets/:id', canActivate: [authGuard], loadComponent: () => import('./modules/support/ticket-detail.component').then(m => m.TicketDetailComponent) },
      { path: 'how-it-works',  loadComponent: () => import('./pages/how-it-works/how-it-works.component').then(m => m.HowItWorksComponent) },
      { path: 'about',         loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent) },
      { path: 'contact',       loadComponent: () => import('./pages/contact/contact.component').then(m => m.ContactComponent) },
      { path: 'help',          loadComponent: () => import('./pages/help/help.component').then(m => m.HelpComponent) },
      { path: 'popular-listings', loadComponent: () => import('./pages/popular-listings/popular-listings.component').then(m => m.PopularListingsComponent) },
      { path: 'faqs',          loadComponent: () => import('./pages/faqs/faqs.component').then(m => m.FaqsComponent) },
      { path: 'become-owner',  loadComponent: () => import('./pages/become-owner/become-owner.component').then(m => m.BecomeOwnerComponent) },
      { path: 'become-rider',  canActivate: [authGuard], loadComponent: () => import('./pages/become-rider/become-rider.component').then(m => m.BecomeRiderComponent) },
      { path: 'careers',       loadComponent: () => import('./pages/careers/careers.component').then(m => m.CareersComponent) },
      { path: 'blog',          loadComponent: () => import('./pages/blog/blog.component').then(m => m.BlogComponent) },
      { path: 'press',         loadComponent: () => import('./pages/press/press.component').then(m => m.PressComponent) },
      { path: 'privacy',       loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent) },
      { path: 'terms',         loadComponent: () => import('./pages/terms/terms.component').then(m => m.TermsComponent) },
      { path: 'cookies',       loadComponent: () => import('./pages/cookies/cookies.component').then(m => m.CookiesComponent) },
      { path: 'safety',        loadComponent: () => import('./pages/safety/safety.component').then(m => m.SafetyComponent) },
      { path: 'trust',         loadComponent: () => import('./pages/trust/trust.component').then(m => m.TrustComponent) },
      { path: '**', loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent) },
    ],
  },
];
