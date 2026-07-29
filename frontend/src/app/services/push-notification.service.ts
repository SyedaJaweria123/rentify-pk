import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * PushNotificationService — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles Firebase Cloud Messaging (FCM) push notifications in the browser.
 *
 * Flow:
 *   1. User logs in → init() called from AppComponent / AuthService
 *   2. Browser asks for notification permission
 *   3. FCM token fetched from Firebase
 *   4. Token sent to backend PUT /api/auth/fcm-token
 *   5. Background messages shown via Service Worker (firebase-messaging-sw.js)
 *   6. On logout → DELETE /api/auth/fcm-token (token removed from DB)
 *
 * Setup steps (one time):
 *   npm install firebase
 *   Add your Firebase config to environment.ts (firebaseConfig object)
 *   Create src/firebase-messaging-sw.js (see bottom of this file)
 * ─────────────────────────────────────────────────────────────────────────────
 */

@Injectable({ providedIn: 'root' })
export class PushNotificationService {

  private tokenSaved = false;

  constructor(private http: HttpClient) {}

  /** Call this once after the user logs in */
  async init(): Promise<void> {
    // Only run in browser with notification support
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!(environment as any).firebaseConfig) {
      console.info('FCM: firebaseConfig not in environment — push disabled.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.info('FCM: notification permission denied.');
        return;
      }
      await this.registerTokenWithBackend();
    } catch (err) {
      console.warn('FCM init error:', err);
    }
  }

  /** Remove token from backend on logout */
  async removeFcmToken(): Promise<void> {
    if (!this.tokenSaved) return;
    try {
      await this.http.delete(`${environment.apiUrl}/auth/fcm-token`).toPromise();
      this.tokenSaved = false;
    } catch (_) {}
  }

  private async registerTokenWithBackend(): Promise<void> {
    try {
      // Lazy load firebase to avoid bundle bloat for users who don't enable push
      const { initializeApp, getApps } = await import('firebase/app');
      const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

      const firebaseConfig = (environment as any).firebaseConfig;
      const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      const messaging = getMessaging(app);

      const vapidKey = (environment as any).fcmVapidKey;
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
      });

      if (!token) return;

      // Send token to backend
      await this.http.put(`${environment.apiUrl}/auth/fcm-token`, { fcmToken: token }).toPromise();
      this.tokenSaved = true;
      console.log('FCM token saved to backend.');

      // Handle foreground messages (app is open)
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || 'Rentify';
        const body  = payload.notification?.body  || '';
        // Show native browser notification even if app is open
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/assets/icons/icon-192x192.png' });
        }
      });

    } catch (err) {
      console.warn('FCM token registration failed:', err);
    }
  }
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 1: Create src/firebase-messaging-sw.js (background push handler)
 * Put this file at: frontend/src/firebase-messaging-sw.js
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
 * importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');
 *
 * firebase.initializeApp({
 *   apiKey:            "YOUR_API_KEY",
 *   authDomain:        "YOUR_PROJECT.firebaseapp.com",
 *   projectId:         "YOUR_PROJECT_ID",
 *   storageBucket:     "YOUR_PROJECT.appspot.com",
 *   messagingSenderId: "YOUR_SENDER_ID",
 *   appId:             "YOUR_APP_ID",
 * });
 *
 * const messaging = firebase.messaging();
 * messaging.onBackgroundMessage((payload) => {
 *   self.registration.showNotification(
 *     payload.notification.title,
 *     { body: payload.notification.body, icon: '/assets/icons/icon-192x192.png' }
 *   );
 * });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 2: Add to environment.ts:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * firebaseConfig: {
 *   apiKey:            "...",
 *   authDomain:        "...",
 *   projectId:         "...",
 *   storageBucket:     "...",
 *   messagingSenderId: "...",
 *   appId:             "...",
 * },
 * fcmVapidKey: "YOUR_VAPID_KEY_FROM_FIREBASE_CONSOLE",
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 3: Add to angular.json assets array:
 * ─────────────────────────────────────────────────────────────────────────────
 *   "src/firebase-messaging-sw.js"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STEP 4: Backend .env variables to add:
 * ─────────────────────────────────────────────────────────────────────────────
 *   FCM_PROJECT_ID=your-firebase-project-id
 *   FCM_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
 *   FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *   GOOGLE_MAPS_API_KEY=your-google-maps-key   (for ETA calculation)
 */
