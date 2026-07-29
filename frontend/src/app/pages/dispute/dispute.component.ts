import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dispute',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './dispute.component.html',
  styleUrls: ['./dispute.component.css'],
})
export class DisputeComponent implements OnInit {

  /* ── Route param ── */
  bookingId = '';

  /* ── Booking summary (loaded from API) ── */
  booking:     any = null;
  bookingLoading   = true;
  bookingError     = '';

  /* ── Dispute form ── */
  issueType    = '';
  description  = '';
  evidenceFiles: File[] = [];
  evidencePreviews: string[] = [];

  /* ── Submit state ── */
  submitting  = false;
  submitError = '';
  submitted   = false;
  disputeRef  = '';

  /* ── Issue types ──
     Note: item damage is intentionally NOT listed here — that flow lives on
     DamageClaim (file → respond → evidence → resolve) so a damage case has
     one record, not two. This form is for everything else. */
  readonly issueTypes = [
    { value: 'item_not_returned', label: '📦 Item was not returned on time' },
    { value: 'item_not_as_listed',label: '❌ Item was not as described in listing' },
    { value: 'payment_issue',     label: '💳 Payment / refund issue' },
    { value: 'owner_unresponsive',label: '📵 Owner was unresponsive' },
    { value: 'renter_no_show',    label: '🚫 Renter did not show up' },
    { value: 'safety_concern',    label: '⚠️ Safety or fraud concern' },
    { value: 'other',             label: '💬 Other issue' },
  ];

  constructor(
    private route:  ActivatedRoute,
    private router: Router,
    private http:   HttpClient,
  ) {}

  ngOnInit(): void {
    this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
    if (this.bookingId) {
      this.loadBooking();
    } else {
      this.bookingLoading = false;
      this.bookingError   = 'No booking ID provided.';
    }
  }

  loadBooking(): void {
    this.http.get(`${environment.apiUrl}/bookings/${this.bookingId}`).subscribe({
      next:  (res: any) => { this.booking = res.data?.booking || null; this.bookingLoading = false; },
      error: (err)      => { this.bookingError = err.error?.message || 'Booking not found.'; this.bookingLoading = false; },
    });
  }

  /* ── Evidence upload ── */
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const newFiles = Array.from(input.files).slice(0, 5 - this.evidenceFiles.length);
    newFiles.forEach(file => {
      if (file.size > 5 * 1024 * 1024) return; // skip > 5MB
      this.evidenceFiles.push(file);
      const reader = new FileReader();
      reader.onload = (e) => this.evidencePreviews.push(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  removeEvidence(index: number): void {
    this.evidenceFiles.splice(index, 1);
    this.evidencePreviews.splice(index, 1);
  }

  /* ── Submit ── */
  submitDispute(): void {
    if (!this.issueType)              { this.submitError = 'Please select an issue type.'; return; }
    if (this.description.trim().length < 20) { this.submitError = 'Please provide at least 20 characters of description.'; return; }

    this.submitting  = true;
    this.submitError = '';

    const formData = new FormData();
    formData.append('bookingId',   this.bookingId);
    formData.append('issueType',   this.issueType);
    formData.append('reason',      this.description);
    this.evidenceFiles.forEach(f => formData.append('evidence', f));

    this.http.post(`${environment.apiUrl}/disputes`, formData).subscribe({
      next: (res: any) => {
        this.submitting  = false;
        this.submitted   = true;
        this.disputeRef  = res.data?.disputeId || `DSP-${Date.now()}`;
      },
      error: (err) => {
        this.submitting  = false;
        this.submitError = err.error?.message || 'Failed to submit dispute. Please try again.';
      },
    });
  }

  get descLength(): number { return this.description.length; }

  getIssueLabel(value: string): string {
    return this.issueTypes.find(t => t.value === value)?.label || value;
  }
}
