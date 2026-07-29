import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {

  // Signal-based state — components can use isDark() directly in templates
  private _isDark = signal<boolean>(this.resolveInitialTheme());

  // Public readable signal
  readonly isDark = this._isDark.asReadonly();

  // Computed display label for the toggle button
  readonly themeLabel = computed(() => this._isDark() ? '☀️ Light' : '🌙 Dark');
  readonly themeIcon  = computed(() => this._isDark() ? '☀️' : '🌙');

  constructor() {
    // Apply theme immediately on service init
    this.applyTheme(this._isDark());

    // Watch for OS-level theme changes (user changes system theme while app is open)
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => {
          // Only follow OS if user hasn't manually set a preference
          if (!localStorage.getItem('rentify_theme')) {
            this._isDark.set(e.matches);
            this.applyTheme(e.matches);
          }
        });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  get isDarkMode(): boolean { return this._isDark(); }

  toggle(): void {
    const newVal = !this._isDark();
    this._isDark.set(newVal);
    this.applyTheme(newVal);
    // Persist user preference
    localStorage.setItem('rentify_theme', newVal ? 'dark' : 'light');
  }

  setLight(): void {
    this._isDark.set(false);
    this.applyTheme(false);
    localStorage.setItem('rentify_theme', 'light');
  }

  setDark(): void {
    this._isDark.set(true);
    this.applyTheme(true);
    localStorage.setItem('rentify_theme', 'dark');
  }

  // ── Private helpers ────────────────────────────────────────────────────────
  private resolveInitialTheme(): boolean {
    if (typeof window === 'undefined') return false;

    // 1. User's saved preference takes priority
    const saved = localStorage.getItem('rentify_theme');
    if (saved === 'dark')  return true;
    if (saved === 'light') return false;

    // 2. Rentify is a light-themed app — default to LIGHT and ignore the OS
    //    dark preference (it was making pages show a near-black background).
    return false;
  }

  private applyTheme(dark: boolean): void {
    if (typeof document === 'undefined') return;
    // Set data-theme attribute on <html> — CSS variables switch based on this
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    // Also update body for immediate paint (before CSS loads)
    document.body.style.backgroundColor = dark ? '#0a0a0f' : '#f8fafc';
    document.body.style.color           = dark ? '#f1f5f9' : '#0f172a';
  }
}
