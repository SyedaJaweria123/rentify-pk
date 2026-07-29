import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { CmsService, TeamMember } from '../../services/cms.service';
import { PublicSettingsService } from '../../core/services/public-settings.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.css'],
})
export class AboutComponent implements OnInit, OnDestroy {

  /* ── Real data from API ── */
  team:        TeamMember[]   = [];
  teamLoading  = true;

  /* ── Core values — icon keys map to real outline SVGs in the template
       (not emoji), matching the icon language used across the rest of the app. */
  readonly values = [
    { icon: 'shield',  title: 'Trust First',        desc: 'Every feature — from CNIC verification to escrow payments — is designed to make you feel safe.' },
    { icon: 'flag',    title: 'Made for Pakistan',  desc: 'PKR prices, Pakistani cities, local payment methods. Built by Pakistanis, for Pakistanis.' },
    { icon: 'leaf',    title: 'Sustainability',     desc: 'Renting reduces waste. Instead of buying new, share what you have and reduce your footprint.' },
    { icon: 'bulb',    title: 'Innovation',         desc: 'We continuously improve the platform based on real feedback from our community.' },
  ];

  /* ── What people rent — real category icons, replacing the old floating emoji cards ── */
  readonly rentCategories = [
    { icon: 'vehicles',    label: 'Vehicles' },
    { icon: 'camera',      label: 'Cameras' },
    { icon: 'electronics', label: 'Electronics' },
    { icon: 'furniture',   label: 'Furniture' },
  ];

  /* ── Real team members. Falls back to this static list (the actual two
     people building Rentify PK) if the CMS team API returns empty — once
     real entries are added via the admin panel, those take priority. ── */
  readonly fallbackTeam: TeamMember[] = [
    {
      _id: 'fallback-1',
      name: 'Syeda Jaweria',
      role: 'Co-Founder & Full-Stack Developer',
      city: 'Karachi',
      bio: 'Builds and maintains the entire Rentify PK platform — frontend, backend, and everything in between.',
      avatar: '/team-syeda.png',
      avatarInitials: 'SJ',
      order: 1,
    },
    {
      _id: 'fallback-2',
      name: 'Fizzah Batool',
      role: 'Co-Founder & Product Designer',
      city: 'Karachi',
      bio: 'Shapes the Rentify PK experience — from user flows to the details that make renting feel simple.',
      avatar: '/team-fizzah.png',
      avatarInitials: 'FB',
      order: 2,
    },
  ];
  /* ── Team member detail popup ── */
  activeMember: TeamMember | null = null;
  openMemberPopup(m: TeamMember): void { this.activeMember = m; }
  closeMemberPopup(): void { this.activeMember = null; }

  contactForm  = { name: '', email: '', subject: '', message: '' };
  contactSent  = false;
  contactError = '';
  contactSending = false;

  private destroy$ = new Subject<void>();

  constructor(private cms: CmsService, public settings: PublicSettingsService, private http: HttpClient) {
    if (!this.settings.loaded()) this.settings.load();
  }

  ngOnInit(): void {
    // ── Fetch real team members from GET /api/cms/team ──
    this.cms.getTeam()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.team        = (data && data.length > 0) ? data : this.fallbackTeam;
          this.teamLoading = false;
        },
        error: () => {
          this.team        = this.fallbackTeam;
          this.teamLoading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submitContact(): void {
    if (!this.contactForm.name || !this.contactForm.email || !this.contactForm.message) {
      this.contactError = 'Please fill in all required fields.';
      return;
    }
    if (this.contactSending) return;
    this.contactError   = '';
    this.contactSending = true;

    const payload = {
      name:    this.contactForm.name,
      email:   this.contactForm.email,
      subject: this.contactForm.subject || 'General Inquiry',
      message: this.contactForm.message,
    };

    this.http.post<any>(`${environment.apiUrl}/support/contact-email`, payload).subscribe({
      next: () => {
        this.contactSending = false;
        this.contactSent    = true;
        this.contactForm    = { name: '', email: '', subject: '', message: '' };
      },
      error: (err) => {
        this.contactSending = false;
        this.contactError   = err?.error?.message || 'Could not send your message. Please try again.';
      },
    });
  }
}
