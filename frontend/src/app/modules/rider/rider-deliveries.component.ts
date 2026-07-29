import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RiderService } from './rider.service';

type DeliveryFilter = 'all' | 'active' | 'completed' | 'cancelled' | 'declined';

@Component({
  selector: 'app-rider-deliveries',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './rider-deliveries.component.html',
  styleUrls: ['./rider-deliveries.component.css'],
})
export class RiderDeliveriesComponent implements OnInit {
  loading = signal(true);
  assignments = signal<any[]>([]);
  filter = signal<DeliveryFilter>('all');
  search = signal('');
  busyId = signal<string | null>(null);
  currentPage = signal(1);
  pageSize = 10;

  filtered = computed(() => {
    let list = this.assignments();

    // Arrived from a notification: show only that assignment. Falls through to
    // the normal list if the id isn't in this rider's assignments (e.g. it was
    // reassigned after they tapped), so they never see a blank page.
    const hl = this.highlightId();
    if (hl) {
      const only = list.filter(a => String(a._id) === String(hl));
      if (only.length) return only;
    }

    const f = this.filter();
    if (f === 'active')     list = list.filter(a => ['assigned', 'accepted', 'picked_up', 'delivered'].includes(a.status));
    else if (f === 'completed') list = list.filter(a => a.status === 'completed');
    else if (f === 'cancelled') list = list.filter(a => a.status === 'cancelled');
    else if (f === 'declined')  list = list.filter(a => a.status === 'declined');

    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        (a.booking?.listing?.title || '').toLowerCase().includes(q) ||
        (a.booking?.listing?.city || '').toLowerCase().includes(q) ||
        (a.pickupAddress || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  // Total pages for the current filtered list.
  totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));

  // Only the slice of deliveries for the current page.
  paginated = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  // Array of page numbers to render, e.g. [1,2,3].
  pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  counts = computed(() => {
    const list = this.assignments();
    return {
      all: list.length,
      active: list.filter(a => ['assigned', 'accepted', 'picked_up', 'delivered'].includes(a.status)).length,
      completed: list.filter(a => a.status === 'completed').length,
      cancelled: list.filter(a => a.status === 'cancelled').length,
      declined: list.filter(a => a.status === 'declined').length,
    };
  });

  constructor(
    private rider: RiderService,
    private router: Router,
    private route: ActivatedRoute,
    private snack: MatSnackBar,
  ) {}

  /** Assignment id to focus, from ?highlight= on the notification link. */
  highlightId = signal<string | null>(null);

  /** True while we're showing only the assignment the rider tapped through to. */
  get isFocused(): boolean { return !!this.highlightId(); }

  ngOnInit(): void {
    // A rider tapping "New delivery assignment" should land on THAT job, not a
    // 24-row history they have to hunt through — so the notification link
    // carries ?highlight=<assignmentId> and we show just that one, with a
    // "show all" escape hatch.
    this.route.queryParamMap.subscribe(p => {
      this.highlightId.set(p.get('highlight'));
      this.currentPage.set(1);
    });
    this.load();
  }

  /** Clear the focus and go back to the full list. */
  clearHighlight(): void {
    this.highlightId.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  load(): void {
    this.loading.set(true);
    this.rider.getAssignments('').subscribe({
      next: (res) => { this.assignments.set(res?.data || []); this.loading.set(false); },
      error: () => { this.assignments.set([]); this.loading.set(false); },
    });
  }

  setFilter(f: DeliveryFilter): void { this.filter.set(f); this.currentPage.set(1); }

  onSearch(v: string): void { this.search.set(v); this.currentPage.set(1); }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.currentPage.set(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  nextPage(): void { this.goToPage(this.currentPage() + 1); }
  prevPage(): void { this.goToPage(this.currentPage() - 1); }

  accept(a: any): void {
    this.busyId.set(a._id);
    this.rider.accept(a._id).subscribe({
      next: () => { this.busyId.set(null); this.snack.open('Assignment accepted.', 'OK', { duration: 3000 }); this.load(); },
      error: (err) => { this.busyId.set(null); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  decline(a: any): void {
    this.busyId.set(a._id);
    this.rider.decline(a._id).subscribe({
      next: () => { this.busyId.set(null); this.snack.open('Assignment declined.', 'OK', { duration: 3000 }); this.load(); },
      error: (err) => { this.busyId.set(null); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  deliver(a: any): void {
    this.router.navigate(['/rider/scan'], { queryParams: { assignment: a._id, action: 'deliver' } });
  }

  complete(a: any): void {
    this.busyId.set(a._id);
    this.rider.complete(a._id).subscribe({
      next: () => { this.busyId.set(null); this.snack.open('Delivery completed!', 'OK', { duration: 3000 }); this.load(); },
      error: (err) => { this.busyId.set(null); this.snack.open(err?.error?.message || 'Failed.', 'Dismiss', { duration: 4000 }); },
    });
  }

  goScanFor(a: any): void {
    this.router.navigate(['/rider/scan'], { queryParams: { assignment: a._id, action: 'pickup' } });
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      assigned: 'Assigned', accepted: 'Accepted', declined: 'Declined', picked_up: 'Picked Up',
      delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
    };
    return map[s] || s;
  }

  statusClass(s: string): string {
    return 'status-' + s;
  }
}
