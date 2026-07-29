import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmDialogData {
  title: string;
  message: string;
  requireReason?: boolean;
  reasonLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'warn' | 'accent';
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="p-6 min-w-80">
      <h2 class="text-xl font-bold text-gray-900 mb-2">{{ data.title }}</h2>
      <p class="text-gray-600 mb-5">{{ data.message }}</p>

      @if (data.requireReason) {
        <mat-form-field appearance="outline" class="w-full mb-4">
          <mat-label>{{ data.reasonLabel || 'Reason (optional)' }}</mat-label>
          <textarea matInput [(ngModel)]="reason" rows="3" placeholder="Enter reason..."></textarea>
        </mat-form-field>
      }

      <div class="flex gap-3 justify-end">
        <button mat-stroked-button [mat-dialog-close]="null">
          {{ data.cancelLabel || 'Cancel' }}
        </button>
        <button mat-flat-button
                [color]="data.confirmColor || 'primary'"
                (click)="confirm()">
          {{ data.confirmLabel || 'Confirm' }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  reason = '';

  constructor(
    private dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
  ) {}

  confirm(): void {
    this.dialogRef.close({ confirmed: true, reason: this.reason });
  }
}
