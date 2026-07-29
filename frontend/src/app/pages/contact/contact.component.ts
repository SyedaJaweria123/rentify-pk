// src/app/pages/contact/contact.component.ts
/**
 * ContactComponent — Rentify PK
 * Professional "Contact Us" page: a green hero, contact-info cards, and a working
 * message form that posts to the real support endpoint (POST /support/contact-email).
 * Standalone, forest-green themed, no external libraries.
 */
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="ct">
    <!-- Hero -->
    <section class="ct-hero">
      <span class="ct-eyebrow">We're here to help</span>
      <h1 class="ct-title">Get in touch</h1>
      <p class="ct-sub">Questions, feedback, or need a hand with a rental? Send us a message and the Rentify team will get back to you shortly.</p>
    </section>

    <div class="ct-grid">
      <!-- Left: info -->
      <aside class="ct-info">
        <div class="ct-info-card">
          <div class="ct-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
          <div>
            <h3>Email us</h3>
            <p>support&#64;rentify.pk</p>
            <span>We reply within 24 hours</span>
          </div>
        </div>

        <div class="ct-info-card">
          <div class="ct-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </div>
          <div>
            <h3>Call us</h3>
            <p>+92 300 1234567</p>
            <span>Mon–Sat, 9am–6pm PKT</span>
          </div>
        </div>

        <div class="ct-info-card">
          <div class="ct-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
            <h3>Visit us</h3>
            <p>Rentify HQ, Karachi</p>
            <span>Sindh, Pakistan</span>
          </div>
        </div>

        <div class="ct-social">
          <a href="#" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a>
          <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
          <a href="#" aria-label="Twitter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M22 4a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 22 4z"/></svg></a>
        </div>
      </aside>

      <!-- Right: form -->
      <section class="ct-form-card">
        <h2 class="ct-form-title">Send us a message</h2>

        <div class="ct-sent" *ngIf="sent">
          <div class="ct-sent-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></div>
          <h3>Message sent!</h3>
          <p>Thanks for reaching out — we'll get back to you soon.</p>
          <button class="ct-btn ct-btn-outline" (click)="sent=false">Send another</button>
        </div>

        <form class="ct-form" *ngIf="!sent" (ngSubmit)="submit()">
          <div class="ct-row">
            <label class="ct-field">
              <span>Full name <i>*</i></span>
              <input type="text" name="name" [(ngModel)]="form.name" placeholder="Your name" required />
            </label>
            <label class="ct-field">
              <span>Email <i>*</i></span>
              <input type="email" name="email" [(ngModel)]="form.email" placeholder="you@example.com" required />
            </label>
          </div>

          <label class="ct-field">
            <span>Subject</span>
            <select name="subject" [(ngModel)]="form.subject">
              <option value="General Inquiry">General Inquiry</option>
              <option value="Booking Help">Booking Help</option>
              <option value="Payment / Wallet">Payment / Wallet</option>
              <option value="Become an Owner">Become an Owner</option>
              <option value="Report a Problem">Report a Problem</option>
              <option value="Feedback">Feedback</option>
            </select>
          </label>

          <label class="ct-field">
            <span>Message <i>*</i></span>
            <textarea name="message" [(ngModel)]="form.message" rows="6" placeholder="How can we help you?" required></textarea>
          </label>

          <p class="ct-error" *ngIf="error">{{ error }}</p>

          <button type="submit" class="ct-btn ct-btn-primary" [disabled]="sending">
            {{ sending ? 'Sending…' : 'Send Message' }}
          </button>
        </form>
      </section>
    </div>
  </div>
  `,
  styles: [`
    :host { display: block; --forest:#1F5435; --forest-d:#143524; --mint:#EAF3DE; --ink:#143524; --ink-2:#5a6b5e; --line:#e4ede4; }
    .ct { max-width: 1120px; margin: 0 auto; padding: 56px 24px 80px; }

    /* Hero */
    .ct-hero { text-align: center; max-width: 640px; margin: 0 auto 44px; }
    .ct-eyebrow { display: inline-block; font-size: 12.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--forest); background: var(--mint); padding: 7px 16px; border-radius: 999px; margin-bottom: 14px; }
    .ct-title { font-size: clamp(32px, 5vw, 46px); font-weight: 900; color: var(--ink); margin: 0 0 12px; letter-spacing: -1px; }
    .ct-sub { font-size: 16px; color: var(--ink-2); line-height: 1.6; margin: 0; }

    .ct-grid { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 28px; align-items: start; }
    @media (max-width: 860px) { .ct-grid { grid-template-columns: 1fr; } }

    /* Info cards */
    .ct-info { display: flex; flex-direction: column; gap: 16px; }
    .ct-info-card { display: flex; gap: 15px; align-items: flex-start; background: #fff; border: 1.5px solid var(--line); border-radius: 16px; padding: 20px; transition: transform .2s, box-shadow .2s; }
    .ct-info-card:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(31,84,45,.10); }
    .ct-ic { width: 46px; height: 46px; flex: none; border-radius: 13px; background: var(--mint); color: var(--forest); display: flex; align-items: center; justify-content: center; }
    .ct-ic svg { width: 22px; height: 22px; }
    .ct-info-card h3 { font-size: 15px; font-weight: 800; color: var(--ink); margin: 0 0 3px; }
    .ct-info-card p { font-size: 14.5px; font-weight: 700; color: var(--forest); margin: 0 0 2px; }
    .ct-info-card span { font-size: 12.5px; color: var(--ink-2); }

    .ct-social { display: flex; gap: 10px; padding: 4px 2px; }
    .ct-social a { width: 42px; height: 42px; border-radius: 12px; border: 1.5px solid var(--line); display: flex; align-items: center; justify-content: center; color: var(--forest); transition: all .2s; }
    .ct-social a svg { width: 18px; height: 18px; }
    .ct-social a:hover { background: var(--forest); color: #fff; border-color: var(--forest); transform: translateY(-2px); }

    /* Form card */
    .ct-form-card { background: #fff; border: 1.5px solid var(--line); border-radius: 20px; padding: 32px; box-shadow: 0 2px 4px rgba(31,84,45,.04), 0 18px 44px rgba(31,84,45,.07); }
    .ct-form-title { font-size: 21px; font-weight: 900; color: var(--ink); margin: 0 0 22px; }
    .ct-form { display: flex; flex-direction: column; gap: 18px; }
    .ct-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    @media (max-width: 520px) { .ct-row { grid-template-columns: 1fr; } }
    .ct-field { display: flex; flex-direction: column; gap: 7px; }
    .ct-field > span { font-size: 13px; font-weight: 700; color: var(--ink); }
    .ct-field > span i { color: #dc2626; font-style: normal; }
    .ct-field input, .ct-field select, .ct-field textarea {
      font-family: inherit; font-size: 14.5px; color: var(--ink);
      padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 11px; background: #fbfdfb;
      transition: border-color .18s, box-shadow .18s; resize: vertical;
    }
    .ct-field input:focus, .ct-field select:focus, .ct-field textarea:focus {
      outline: none; border-color: var(--forest); box-shadow: 0 0 0 3px rgba(31,84,45,.12); background: #fff;
    }
    .ct-error { font-size: 13px; color: #dc2626; margin: -4px 0 0; font-weight: 600; }

    .ct-btn { font-family: inherit; font-size: 14.5px; font-weight: 800; border-radius: 11px; cursor: pointer; padding: 13px 26px; transition: all .2s; border: none; }
    .ct-btn-primary { background: var(--forest); color: #fff; box-shadow: 0 4px 16px rgba(31,84,45,.25); }
    .ct-btn-primary:hover:not(:disabled) { background: var(--forest-d); transform: translateY(-2px); }
    .ct-btn-primary:disabled { opacity: .65; cursor: default; }
    .ct-btn-outline { background: #fff; color: var(--forest); border: 1.5px solid var(--forest); }
    .ct-btn-outline:hover { background: var(--mint); }

    /* Sent state */
    .ct-sent { text-align: center; padding: 24px 10px; }
    .ct-sent-ic { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%; background: var(--mint); color: var(--forest); display: flex; align-items: center; justify-content: center; }
    .ct-sent-ic svg { width: 30px; height: 30px; }
    .ct-sent h3 { font-size: 20px; font-weight: 900; color: var(--ink); margin: 0 0 6px; }
    .ct-sent p { font-size: 14.5px; color: var(--ink-2); margin: 0 0 20px; }
  `],
})
export class ContactComponent {
  form = { name: '', email: '', subject: 'General Inquiry', message: '' };
  sending = false;
  sent = false;
  error = '';

  constructor(private http: HttpClient) {}

  submit(): void {
    if (!this.form.name || !this.form.email || !this.form.message) {
      this.error = 'Please fill in all required fields.';
      return;
    }
    if (this.sending) return;
    this.error = '';
    this.sending = true;

    const payload = {
      name: this.form.name,
      email: this.form.email,
      subject: this.form.subject || 'General Inquiry',
      message: this.form.message,
    };

    this.http.post<any>(`${environment.apiUrl}/support/contact-email`, payload).subscribe({
      next: () => {
        this.sending = false;
        this.sent = true;
        this.form = { name: '', email: '', subject: 'General Inquiry', message: '' };
      },
      error: (err) => {
        this.sending = false;
        this.error = err?.error?.message || 'Could not send your message. Please try again.';
      },
    });
  }
}