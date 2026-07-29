// src/app/shared/components/why-choose.component.ts
/**
 * WhyChooseComponent — Rentify PK
 * "Why Choose Us" as a REAL horizontal pinned-scroll section (like the reference
 * site): the section pins to the viewport and, as you scroll down, the panels
 * slide horizontally — a giant "WHY CHOOSE US" title followed by feature panels.
 *
 * GSAP + ScrollTrigger are self-hosted (public/gsap.min.js, ScrollTrigger.min.js,
 * loaded in index.html) and used via the global objects. Everything is GUARDED:
 * if GSAP isn't available, or on small screens, the section falls back to a
 * normal stacked layout — it never crashes the page.
 */
import { Component, AfterViewInit, OnDestroy, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

declare const gsap: any;
declare const ScrollTrigger: any;

interface Panel { pct: string; label: string; desc: string; }

@Component({
  selector: 'app-why-choose',
  standalone: true,
  imports: [CommonModule],
  template: `
  <section class="hp" [class.hp-ready]="ready()">
    <div class="hp-track" #track>

      <!-- Intro panel -->
      <div class="hp-panel hp-intro">
        <div class="hp-intro-text">
          <span class="hp-eyebrow">Why Choose Rentify</span>
          <h2 class="hp-title">WHY<br>CHOOSE<br>US</h2>
          <span class="hp-hint" *ngIf="ready()">scroll →</span>
        </div>
        <div class="hp-intro-img">
          <img src="/why-choose-illustration.png" alt="Rentify analytics dashboard" loading="lazy" />
        </div>
      </div>

      <!-- Feature panels -->
      <div class="hp-panel hp-feat" *ngFor="let p of panels; let i = index">
        <span class="hp-num">{{ p.pct }}</span>
        <h3 class="hp-label">{{ p.label }}</h3>
        <p class="hp-desc">{{ p.desc }}</p>
        <span class="hp-idx">0{{ i + 1 }}</span>
      </div>

    </div>
  </section>
  `,
  styles: [`
    :host { display: block; }
    .hp { position: relative; background: linear-gradient(180deg, #FBF7EC 0%, #F5EFDF 100%); }

    /* Default (no GSAP / mobile): normal stacked, fully readable */
    .hp-track { display: flex; flex-wrap: wrap; gap: 20px; padding: 64px 24px; max-width: 1200px; margin: 0 auto; }
    .hp-panel { flex: 1 1 320px; min-height: 260px; display: flex; flex-direction: column; justify-content: center; }

    /* GSAP-ready: horizontal pinned row, each panel full viewport height */
    .hp-ready .hp { overflow: hidden; }
    .hp-ready .hp-track { flex-wrap: nowrap; gap: 0; padding: 0; max-width: none; height: 100vh; align-items: stretch; }
    .hp-ready .hp-panel { flex: 0 0 auto; height: 100vh; padding: 0 6vw; justify-content: center; }
    .hp-ready .hp-intro { width: 100vw; display: flex; flex-direction: row; align-items: center; gap: 4vw; }
    .hp-intro-text { flex: 0 0 auto; }
    .hp-intro-img { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; }
    .hp-intro-img img { width: 100%; max-width: 660px; height: auto; border-radius: 20px; }
    @media (max-width: 767px) { .hp-intro-img img { max-width: 420px; } }
    .hp-ready .hp-feat  { width: 62vw; border-left: 1px solid rgba(31,84,45,.12); }
    @media (max-width: 640px) { .hp-ready .hp-feat { width: 88vw; } }

    /* Intro */
    .hp-intro { position: relative; }
    .hp-eyebrow {
      display: inline-block; width: fit-content; font-size: 13px; font-weight: 800; letter-spacing: 2px;
      text-transform: uppercase; color: #1F5435; background: #EAF3DE; padding: 8px 18px; border-radius: 999px; margin-bottom: 22px;
    }
    .hp-title { font-size: clamp(48px, 9vw, 130px); font-weight: 900; letter-spacing: -3px; line-height: .9; color: #16130c; margin: 0; }
    .hp-hint { margin-top: 26px; font-size: 15px; font-weight: 700; color: #1F5435; letter-spacing: 1px; animation: hpPulse 1.6s ease-in-out infinite; }
    @keyframes hpPulse { 0%,100%{ transform: translateX(0); opacity:.7; } 50%{ transform: translateX(8px); opacity:1; } }

    /* Feature panels */
    .hp-feat { position: relative; }
    .hp-num { font-size: clamp(46px, 6vw, 84px); font-weight: 900; color: #1F5435; line-height: 1; letter-spacing: -2px; }
    .hp-label { font-size: clamp(20px, 2.6vw, 30px); font-weight: 900; color: #143524; margin: 14px 0 12px; }
    .hp-desc { font-size: 15.5px; color: #5a5142; line-height: 1.65; max-width: 460px; }
    .hp-idx { position: absolute; top: 8vh; right: 6vw; font-size: 15px; font-weight: 800; color: rgba(31,84,45,.35); letter-spacing: 2px; }
  `],
})
export class WhyChooseComponent implements AfterViewInit, OnDestroy {
  ready = signal(false);

  panels: Panel[] = [
    { pct: '100%',   label: 'Verified Owners',       desc: 'Every owner passes CNIC + face verification before they can list. You always know who you\'re renting from.' },
    { pct: '99%',    label: 'Secure Payments',       desc: 'Protected wallet and escrow-style payouts. Your money is held safely until your rental is confirmed.' },
    { pct: '24/7',   label: 'Real Support',          desc: 'Stuck at 2 AM? Our team and in-app help are always one tap away — real humans, real answers.' },
    { pct: '5000+',  label: 'Rent Almost Anything',  desc: 'From cameras and drills to bikes and party gear — thousands of listings across Pakistan.' },
  ];

  private tween: any;

  constructor(private host: ElementRef) {}

  ngAfterViewInit(): void {
    // Guard: no GSAP, or a small screen → keep the readable stacked fallback.
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    if (window.innerWidth < 768) return;

    try {
      gsap.registerPlugin(ScrollTrigger);
      const root = this.host.nativeElement as HTMLElement;
      const section = root.querySelector('.hp') as HTMLElement;
      const track = root.querySelector('.hp-track') as HTMLElement;

      this.ready.set(true);

      // Let the layout switch to horizontal before measuring
      setTimeout(() => {
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
        this.tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => '+=' + distance(),
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        ScrollTrigger.refresh();
      }, 60);
    } catch {
      this.ready.set(false); // fall back to stacked layout on any error
    }
  }

  ngOnDestroy(): void {
    try {
      this.tween?.scrollTrigger?.kill();
      this.tween?.kill();
    } catch {}
  }
}
