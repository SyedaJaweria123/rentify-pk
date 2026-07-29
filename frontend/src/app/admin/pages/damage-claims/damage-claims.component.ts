import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DamageClaimService } from '../../../modules/damage-claim/damage-claim.service';

@Component({
  selector: 'app-admin-damage-claims',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './damage-claims.component.html',
  styleUrls: ['./damage-claims.component.css'],
})
export class AdminDamageClaimsComponent implements OnInit {

  claims: any[] = [];
  loading = true;
  error = '';

  statusFilter = '';
  readonly statuses = ['pending', 'accepted', 'disputed', 'resolved', 'rejected'];

  // Detail panel
  selected: any = null;
  decision: 'resolve' | 'reject' | '' = '';
  amount: number | null = null;
  note = '';
  actionBusy = false;
  actionMsg = '';

  constructor(private svc: DamageClaimService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true; this.error = '';
    this.svc.list(this.statusFilter).subscribe({
      next: (res) => {
        this.claims = res?.data || [];
        this.loading = false;
      },
      error: (err) => { this.error = err?.error?.message || 'Could not load damage claims.'; this.loading = false; },
    });
  }

  onFilter(): void { this.load(); }
  clearFilters(): void { this.statusFilter = ''; this.load(); }

  openClaim(c: any): void {
    this.actionMsg = '';
    this.selected = c;
    this.decision = '';
    this.amount = c.estimatedCost ?? null;
    this.note = '';
  }
  closeDetail(): void { this.selected = null; this.actionMsg = ''; }

  resolveClaim(): void {
    if (!this.decision || this.actionBusy) return;
    if (this.decision === 'resolve' && (!this.amount || this.amount <= 0)) {
      this.actionMsg = 'Enter a valid deduction amount.';
      return;
    }
    this.actionBusy = true; this.actionMsg = '';
    this.svc.resolve(this.selected._id || this.selected.id, this.decision, this.amount || 0, this.note).subscribe({
      next: (res) => {
        this.selected = res?.data || this.selected;
        this.actionBusy = false;
        this.actionMsg = `Claim ${this.decision}d.`;
        this.load();
      },
      error: (err) => { this.actionBusy = false; this.actionMsg = err?.error?.message || 'Could not resolve claim.'; },
    });
  }

  statusClass(s: string): string {
    return {
      pending: 'dc-pending', accepted: 'dc-accepted', disputed: 'dc-disputed',
      resolved: 'dc-resolved', rejected: 'dc-rejected',
    }[s] || 'dc-pending';
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { if (this.selected) this.closeDetail(); }
}
