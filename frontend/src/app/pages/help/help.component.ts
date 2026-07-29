import { Component, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

@Pipe({ name: 'sanitize', standalone: true })
export class SanitizePipe implements PipeTransform {
  constructor(private s: DomSanitizer) {}
  transform(v: string): SafeHtml { return this.s.bypassSecurityTrustHtml(v); }
}

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SanitizePipe],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.css'],
})
export class HelpComponent {
  searchQuery   = '';
  searchFocused = false;
  searchResults: { q: string; a: string; cat: string }[] = [];
  showForm      = false;
  showEmailForm = false;
  emailSent     = false;
  emailSending  = false;
  emailError    = '';
  emailForm     = { name: '', email: '', subject: '', message: '' };

  readonly helpTopics = [
    { title: 'Account',     desc: 'Manage your account and profile',          route: '/faqs', bg: '#EAF3DE', color: '#1F5435', svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
    { title: 'Earnings',    desc: 'Learn about earnings, payouts and more',   route: '/faqs', bg: '#EAF3DE', color: '#1F5435', svg: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M16 14h2"/>' },
    { title: 'Withdrawals', desc: 'Help with withdrawal and transactions',     route: '/faqs', bg: '#EAF3DE', color: '#1F5435', svg: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
    { title: 'Payments',    desc: 'Payment methods and issues',                route: '/faqs', bg: '#EAF3DE', color: '#1F5435', svg: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>' },
    { title: 'Security',    desc: 'Keep your account safe and secure',         route: '/faqs', bg: '#EAF3DE', color: '#1F5435', svg: '<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>' },
    { title: 'Other',       desc: 'General queries and more',                  route: '/faqs', bg: '#EAF3DE', color: '#1F5435', svg: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>' },
  ];

  readonly allFaqs = [
    { q: 'What is Rentify?',                      a: "Pakistan's peer-to-peer rental marketplace.",              cat: 'General' },
    { q: 'Is Rentify free to use?',               a: 'Browsing is free. 5% fee on completed bookings.',          cat: 'General' },
    { q: 'How do I create an account?',           a: 'Click Get Started and sign up with email or Google.',      cat: 'Account' },
    { q: 'How do I verify my CNIC?',              a: 'Profile → CNIC Verification. Upload documents.',           cat: 'Account' },
    { q: 'How do I reset my password?',           a: 'Click Forgot Password on login page and follow OTP.',      cat: 'Account' },
    { q: 'How do I rent an item?',                a: 'Browse, select dates, book. Owner confirms, then pay.',     cat: 'Renting' },
    { q: 'How do I list my item?',                a: 'Go to Add Listing, fill details, upload photos.',          cat: 'Owners' },
    { q: 'How do I get paid?',                    a: 'Earnings go to wallet after booking completes.',           cat: 'Earnings' },
    { q: 'What is the platform fee?',             a: '5% service fee on completed bookings.',                    cat: 'Earnings' },
    { q: 'How can I withdraw my earnings?',       a: 'Wallet → Withdraw. JazzCash/Easypaisa/Bank.',             cat: 'Withdrawals' },
    { q: 'How long does withdrawal take?',        a: 'Admin processes within 1-3 business days.',                cat: 'Withdrawals' },
    { q: 'Is there any withdrawal fee?',          a: 'No withdrawal fee.',                                       cat: 'Withdrawals' },
    { q: 'What payment methods are accepted?',    a: 'JazzCash, Easypaisa, Bank Transfer.',                     cat: 'Payments' },
    { q: 'How long does payment verification take?', a: 'Few hours during working hours.',                       cat: 'Payments' },
    { q: 'How does escrow work?',                 a: 'Payment held safely until rental ends.',                   cat: 'Payments' },
    { q: 'How does CNIC verification work?',      a: 'Upload front/back/selfie. Team reviews within 24h.',       cat: 'Security' },
    { q: 'Is my information safe?',               a: 'Passwords encrypted, CNIC stored securely.',              cat: 'Security' },
    { q: 'How do disputes work?',                 a: 'File from booking with evidence. Resolved in 48h.',        cat: 'Security' },
  ];

  doSearch(): void {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) { this.searchResults = []; return; }
    this.searchResults = this.allFaqs
      .filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
      .slice(0, 6);
  }

  openResult(r: any): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.router.navigate(['/faqs']);
  }

  goTopic(route: string): void { this.router.navigate([route]); }
  goTicket(): void { this.showForm = true; setTimeout(() => document.querySelector('.hp-form-section')?.scrollIntoView({ behavior: 'smooth' }), 50); }

  /* ── Ticket form ── */
  private api = environment.apiUrl;
  constructor(private http: HttpClient, public auth: AuthService, public router: Router) {}

  get isLoggedIn(): boolean { return this.auth.isLoggedIn; }
  get userName(): string  { return (this.auth.currentUser as any)?.name || ''; }
  get userEmail(): string { return (this.auth.currentUser as any)?.email || ''; }

  readonly ticketCategories = ['Property Issue', 'Payment Issue', 'Account Issue', 'Technical Issue', 'Other'];
  form        = { subject: '', category: 'Property Issue', message: '' };
  attachment: File | null = null;
  submitting  = false;
  submitted   = false;
  submitError = '';
  ticketNumber = '';

  submitTicket(): void {
    if (!this.form.subject.trim() || !this.form.message.trim()) {
      this.submitError = 'Subject and message are required.'; return;
    }
    this.submitting = true; this.submitError = '';
    const fd = new FormData();
    fd.append('subject',  this.form.subject);
    fd.append('category', this.form.category);
    fd.append('message',  this.form.message);
    if (this.attachment) fd.append('attachment', this.attachment);
    this.http.post<any>(`${this.api}/support`, fd).subscribe({
      next: (r) => { this.submitting = false; this.submitted = true; this.ticketNumber = r?.data?.ticketNumber || ''; },
      error: (e) => { this.submitting = false; this.submitError = e?.error?.message || 'Submission failed.'; },
    });
  }

  sendEmail(): void {
    const { name, email, subject, message } = this.emailForm;
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      this.emailError = 'Sab fields zaruri hain.'; return;
    }
    this.emailSending = true; this.emailError = '';
    this.http.post<any>(`${this.api}/support/contact-email`, this.emailForm).subscribe({
      next: () => {
        this.emailSending = false;
        this.emailSent    = true;
        this.emailForm    = { name: '', email: '', subject: '', message: '' };
      },
      error: (e) => {
        this.emailSending = false;
        this.emailError   = e?.error?.message || 'Email send nahi hua. Dobara try karein.';
      },
    });
  }

  resetForm(): void {
    this.submitted = false; this.form = { subject: '', category: 'Property Issue', message: '' };
    this.ticketNumber = ''; this.submitError = '';
  }
}
