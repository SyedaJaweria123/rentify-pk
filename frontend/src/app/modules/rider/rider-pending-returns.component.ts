import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { RiderService } from './rider.service';

@Component({
  selector: 'app-rider-pending-returns',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './rider-pending-returns.component.html',
  styleUrls: ['./rider-pending-returns.component.css'],
})
export class RiderPendingReturnsComponent implements OnInit {
  loading = signal(true);
  returns  = signal<any[]>([]);
  error    = signal('');

  urgentCount = computed(() =>
    this.returns().filter(a => this.isUrgent(a)).length
  );

  constructor(private rider: RiderService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true); this.error.set('');
    this.rider.getPendingReturns().subscribe({
      next: (res) => { this.returns.set(res?.data || []); this.loading.set(false); },
      error: (err) => { this.error.set(err?.error?.message || 'Could not load pending returns.'); this.loading.set(false); },
    });
  }

  goDeliver(a: any): void {
    this.router.navigate(['/rider/deliver', a._id]);
  }

  /** Return is "urgent" if the booking's endDate has already passed. */
  isUrgent(a: any): boolean {
    const end = a.booking?.endDate;
    return end ? new Date(end) < new Date() : false;
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      assigned:  'Assigned',
      accepted:  'Accepted',
      picked_up: 'Picked Up',
      delivered: 'Awaiting Scan',
    };
    return labels[status] || status;
  }

  statusClass(status: string): string {
    const cls: Record<string, string> = {
      assigned:  'rpr-badge-assigned',
      accepted:  'rpr-badge-accepted',
      picked_up: 'rpr-badge-picked',
      delivered: 'rpr-badge-delivered',
    };
    return cls[status] || '';
  }
}
