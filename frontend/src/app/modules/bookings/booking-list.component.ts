import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { BookingService } from './booking.service';
import { AuthService } from '../../services/auth.service';
import { BookingCardComponent } from './booking-card.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { OwnerLayoutComponent } from '../dashboard/owner-layout.component';
import { RenterLayoutComponent } from '../dashboard/renter-layout.component';

@Component({
  selector: 'app-booking-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule,
    MatTabsModule, MatButtonModule, MatBadgeModule,
    MatChipsModule, MatProgressSpinnerModule, MatDialogModule,
    BookingCardComponent, OwnerLayoutComponent, RenterLayoutComponent,
  ],
  templateUrl: './booking-list.component.html',
  styleUrls: ['./booking-list.component.css'],
})
export class BookingListComponent implements OnInit {
  bookings   = signal<any[]>([]);
  loading    = signal(false);
  pagination = signal<any>(null);
  activeStatus = signal('all');

  readonly statusTabs = [
    { label: 'All',       value: 'all' },
    { label: 'Pending',   value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Active',    value: 'active' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  constructor(
    private bookingSvc: BookingService,
    public  auth:       AuthService,
    private snack:      MatSnackBar,
    private dialog:     MatDialog,
  ) {}

  get isOwner(): boolean { return this.auth.isOwner; }

  ngOnInit(): void {
    this.load();
  }

  load(page = 1): void {
    this.loading.set(true);
    this.bookingSvc.getAll({
      page,
      limit: 10,
      status: this.activeStatus(),
      role: this.isOwner ? 'owner' : 'renter',
    }).subscribe({
      next: (res) => {
        this.bookings.set(res.data.bookings);
        this.pagination.set(res.data.pagination);
        this.loading.set(false);
      },
      error: () => {
        this.snack.open('Failed to load bookings', 'Close', { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  onTabChange(status: string): void {
    this.activeStatus.set(status);
    this.load();
  }

  onPageChange(page: number): void {
    this.load(page);
  }

  onConfirm(bookingId: string): void {
    this.bookingSvc.confirm(bookingId).subscribe({
      next: () => {
        this.snack.open('Booking confirmed!', 'Close', { duration: 3000 });
        this.load();
      },
      error: (err) => this.snack.open(err.error?.message || 'Failed to confirm', 'Close', { duration: 3000 }),
    });
  }

  onReject(booking: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Reject Booking',
        message: 'Are you sure you want to reject this booking request?',
        requireReason: true,
        confirmLabel: 'Reject',
        confirmColor: 'warn',
      },
    });

    ref.afterClosed().subscribe(result => {
      if (!result?.confirmed) return;
      this.bookingSvc.reject(booking._id, result.reason).subscribe({
        next: () => {
          this.snack.open('Booking rejected.', 'Close', { duration: 3000 });
          this.load();
        },
        error: (err) => this.snack.open(err.error?.message || 'Failed to reject', 'Close', { duration: 3000 }),
      });
    });
  }

  onCancel(booking: any): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Cancel Booking',
        message: 'Are you sure you want to cancel this booking?',
        requireReason: true,
        confirmLabel: 'Cancel Booking',
        confirmColor: 'warn',
      },
    });

    ref.afterClosed().subscribe(result => {
      if (!result?.confirmed) return;
      this.bookingSvc.cancel(booking._id, result.reason).subscribe({
        next: () => {
          this.snack.open('Booking cancelled.', 'Close', { duration: 3000 });
          this.load();
        },
        error: (err) => this.snack.open(err.error?.message || 'Failed to cancel', 'Close', { duration: 3000 }),
      });
    });
  }

  onComplete(bookingId: string): void {
    this.bookingSvc.complete(bookingId).subscribe({
      next: () => {
        this.snack.open('Booking marked as complete!', 'Close', { duration: 3000 });
        this.load();
      },
      error: (err) => this.snack.open(err.error?.message || 'Failed to complete', 'Close', { duration: 3000 }),
    });
  }
}
