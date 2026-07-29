// src/app/admin/components/data-table/data-table.component.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TableColumn {
  key:      string;
  label:    string;
  sortable?: boolean;
  type?:    'text' | 'badge' | 'image' | 'date' | 'currency' | 'actions';
  badgeColors?: Record<string, string>;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="table-wrapper">

      <!-- Toolbar -->
      <div class="table-toolbar">
        <div class="toolbar-left">
          <div class="search-box" *ngIf="showSearch">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style="stroke:var(--text-muted,#4A6080);stroke-width:1.75;stroke-linecap:round;flex-shrink:0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input [(ngModel)]="searchQuery" (ngModelChange)="onSearch()"
              type="text" [placeholder]="'Search ' + title + '...'" class="search-input">
          </div>
        </div>
        <div class="toolbar-right">
          <select [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()" class="page-size-select">
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
          </select>
          <button *ngIf="exportable" (click)="export.emit('csv')" class="export-btn">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" style="stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th *ngIf="selectable" class="th-check">
                <input type="checkbox" (change)="toggleAll($event)" [checked]="allSelected">
              </th>
              <th *ngFor="let col of columns" (click)="col.sortable && sortBy(col.key)"
                [class.sortable]="col.sortable" [class.sorted]="sortColumn === col.key">
                {{ col.label }}
                <span *ngIf="col.sortable" class="sort-icon">
                  {{ sortColumn === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '⇅' }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr *ngIf="loading">
              <td [colSpan]="columns.length + (selectable ? 1 : 0)" class="td-loading">
                <div class="loading-rows">
                  <div *ngFor="let i of [1,2,3,4,5]" class="loading-row">
                    <div *ngFor="let col of columns" class="loading-cell"></div>
                  </div>
                </div>
              </td>
            </tr>
            <tr *ngIf="!loading && data.length === 0">
              <td [colSpan]="columns.length + (selectable ? 1 : 0)" class="td-empty">
                <div class="empty-state">
                  <svg width="36" height="36" fill="none" viewBox="0 0 24 24" style="stroke:var(--text-muted,#4A6080);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;display:block;margin:0 auto 12px">
                    <path d="M22 12h-6l-2 3H10l-2-3H2"/>
                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                  </svg>
                  <p>No {{ title }} found</p>
                </div>
              </td>
            </tr>
            <tr *ngFor="let row of data; trackBy: trackId" class="data-row"
              [class.selected]="selectedIds.has(row._id)">
              <td *ngIf="selectable" class="td-check">
                <input type="checkbox" [checked]="selectedIds.has(row._id)"
                  (change)="toggleRow(row._id)">
              </td>
              <td *ngFor="let col of columns" class="data-cell">

                <!-- Image -->
                <ng-container *ngIf="col.type === 'image'">
                  <img [src]="row[col.key] || '/assets/placeholder.png'"
                    class="cell-img" [alt]="col.label">
                </ng-container>

                <!-- Badge -->
                <ng-container *ngIf="col.type === 'badge'">
                  <span class="badge" [class]="getBadgeClass(col, row[col.key])">
                    {{ row[col.key] }}
                  </span>
                </ng-container>

                <!-- Date -->
                <ng-container *ngIf="col.type === 'date'">
                  <span class="cell-date">{{ row[col.key] | date:'MMM d, y' }}</span>
                </ng-container>

                <!-- Currency -->
                <ng-container *ngIf="col.type === 'currency'">
                  <span class="cell-currency">Rs {{ row[col.key] | number:'1.0-0' }}</span>
                </ng-container>

                <!-- Actions -->
                <ng-container *ngIf="col.type === 'actions'">
                  <div class="cell-actions">
                    <button (click)="view.emit(row)" class="action-btn action-view" title="View">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style="stroke:currentColor;stroke-width:1.75;stroke-linecap:round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button (click)="edit.emit(row)" class="action-btn action-edit" title="Edit">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style="stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button (click)="delete.emit(row)" class="action-btn action-delete" title="Delete">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style="stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </ng-container>

                <!-- Text (default) -->
                <ng-container *ngIf="!col.type || col.type === 'text'">
                  <span class="cell-text">{{ row[col.key] }}</span>
                </ng-container>

              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="table-pagination">
        <p class="pagination-info">
          Showing {{ (currentPage - 1) * +pageSize + 1 }}–{{ Math.min(currentPage * +pageSize, total) }} of {{ total }}
        </p>
        <div class="pagination-controls">
          <button [disabled]="currentPage <= 1" (click)="goToPage(currentPage - 1)" class="page-btn">←</button>
          <button *ngFor="let p of pages" (click)="goToPage(p)"
            class="page-btn" [class.page-active]="p === currentPage">{{ p }}</button>
          <button [disabled]="currentPage >= totalPages" (click)="goToPage(currentPage + 1)" class="page-btn">→</button>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .table-wrapper { background: var(--bg-surface,#161C26); border-radius: 16px; border: 1px solid var(--border-color,#1E2A38); overflow: hidden; }
    .table-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 1.25rem; border-bottom: 1px solid var(--bg-elevated,#1A2233); gap: 1rem; flex-wrap: wrap;
    }
    .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 0.75rem; }
    .search-box {
      display: flex; align-items: center; gap: 0.5rem;
      background: var(--bg-elevated,#1A2233); border: 1px solid var(--border-color,#1E2A38); border-radius: 10px;
      padding: 0.5rem 0.875rem;
    }
    .search-input { border: none; background: transparent; outline: none; font-size: 0.8125rem; width: 200px; }
    .page-size-select {
      border: 1px solid var(--border-color,#1E2A38); border-radius: 8px; padding: 0.5rem 0.75rem;
      font-size: 0.8125rem; background: var(--bg-base,#1A2233); cursor: pointer; outline: none;
    }
    .export-btn {
      padding: 0.5rem 1rem; background: #f0fdf4; color: #16a34a;
      border: 1px solid #bbf7d0; border-radius: 8px; font-size: 0.8125rem;
      font-weight: 600; cursor: pointer; transition: all 0.2s;
    }
    .export-btn:hover { background: #dcfce7; }

    .table-scroll { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    thead tr { background: var(--bg-elevated,#1A2233); }
    th {
      padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem;
      font-weight: 600; color: var(--text-muted,#4A6080); text-transform: uppercase;
      letter-spacing: 0.05em; white-space: nowrap; border-bottom: 1px solid var(--border-color,#1E2A38);
    }
    th.sortable { cursor: pointer; user-select: none; }
    th.sortable:hover { color: var(--primary,#00C48C); }
    th.sorted { color: var(--primary,#00C48C); }
    .sort-icon { margin-left: 4px; font-size: 0.625rem; }
    .th-check, .td-check { width: 40px; padding: 0.75rem 0.5rem 0.75rem 1rem; }

    .data-row { transition: background 0.15s; border-bottom: 1px solid var(--bg-elevated,#1A2233); }
    .data-row:hover { background: var(--bg-elevated,#1A2233); }
    .data-row.selected { background: #f0f0ff; }
    .data-cell { padding: 0.875rem 1rem; vertical-align: middle; }

    .cell-img { width: 56px; height: 44px; border-radius: 8px; object-fit: cover; background: var(--bg-base,#1A2233); }
    .cell-text { color: var(--text-primary,#E8EDF2); }
    .cell-date { color: var(--text-muted,#4A6080); white-space: nowrap; }
    .cell-currency { font-weight: 600; color: var(--text-primary,#E8EDF2); }

    .badge {
      padding: 3px 10px; border-radius: 100px;
      font-size: 0.6875rem; font-weight: 600; text-transform: capitalize;
    }
    .badge-active, .badge-confirmed, .badge-verified, .badge-approved { background:var(--badge-success-bg); color:var(--badge-success-txt); }
    .badge-pending, .badge-inactive { background:var(--badge-warning-bg); color:var(--badge-warning-txt); }
    .badge-suspended, .badge-cancelled, .badge-rejected, .badge-deleted { background:var(--badge-danger-bg); color:var(--badge-danger-txt); }
    .badge-rented, .badge-completed { background:var(--badge-info-bg); color:var(--badge-info-txt); }

    .cell-actions { display: flex; gap: 0.375rem; }
    .action-btn {
      width: 28px; height: 28px; border: none; border-radius: 6px;
      cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .action-view   { background:var(--badge-info-bg); color:var(--badge-info-txt); } .action-view:hover { filter:brightness(0.95); }
    .action-edit   { background:var(--badge-success-bg); color:var(--badge-success-txt); } .action-edit:hover { filter:brightness(0.95); }
    .action-delete { background:var(--badge-danger-bg); color:var(--badge-danger-txt); } .action-delete:hover { filter:brightness(0.95); }

    .td-loading, .td-empty { padding: 0; }
    .loading-rows { display: flex; flex-direction: column; }
    .loading-row {
      display: flex; gap: 1rem; padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--bg-elevated,#1A2233); animation: pulse 1.5s ease-in-out infinite;
    }
    .loading-cell { height: 14px; border-radius: 6px; flex: 1; background:linear-gradient(90deg, var(--bg-base,#1A2233) 25%, var(--bg-hover,#1E2A38) 50%, var(--bg-base,#1A2233) 75%); background-size:200% 100%; animation:shimmer 1.6s ease-in-out infinite; }
    @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    .empty-state { padding: 3rem; text-align: center; color: var(--text-muted,#4A6080); }
    .empty-icon { font-size: 2.5rem; display: block; margin-bottom: 0.75rem; }
    .empty-state p { font-size: 0.9375rem; font-weight: 500; }

    .table-pagination {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.875rem 1.25rem; border-top: 1px solid var(--bg-elevated,#1A2233); flex-wrap: wrap; gap: 0.75rem;
    }
    .pagination-info { font-size: 0.8125rem; color: var(--text-muted,#4A6080); }
    .pagination-controls { display: flex; align-items: center; gap: 0.25rem; }
    .page-btn {
      width: 32px; height: 32px; border: 1px solid var(--border-color,#1E2A38); border-radius: 8px;
      background: var(--bg-surface,#161C26); font-size: 0.8125rem; cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center;
    }
    .page-btn:hover:not(:disabled) { background: var(--primary-l); border-color: var(--primary,#00C48C); color: var(--primary,#00C48C); }
    .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-active { background: var(--primary,#00C48C) !important; color: #fff !important; border-color: var(--primary,#00C48C) !important; }
  `]
})
export class DataTableComponent implements OnInit {
  @Input() title      = 'items';
  @Input() columns:   TableColumn[] = [];
  @Input() data:      any[]  = [];
  @Input() total      = 0;
  @Input() loading    = false;
  @Input() selectable = true;
  @Input() exportable = true;
  @Input() showSearch = true;

  @Output() pageChange    = new EventEmitter<number>();
  @Output() searchChange  = new EventEmitter<string>();
  @Output() sortChange    = new EventEmitter<{ column: string; dir: string }>();
  @Output() view          = new EventEmitter<any>();
  @Output() edit          = new EventEmitter<any>();
  @Output() delete        = new EventEmitter<any>();
  @Output() export        = new EventEmitter<string>();
  @Output() selectionChange = new EventEmitter<string[]>();

  searchQuery  = '';
  currentPage  = 1;
  pageSize     = 10;
  sortColumn   = '';
  sortDir      = 'asc';
  selectedIds  = new Set<string>();

  Math = Math;

  get totalPages(): number { return Math.ceil(this.total / +this.pageSize); }
  get allSelected(): boolean { return this.data.length > 0 && this.data.every(r => this.selectedIds.has(r._id)); }
  get pages(): number[] {
    const p = [];
    const start = Math.max(1, this.currentPage - 2);
    const end   = Math.min(this.totalPages, start + 4);
    for (let i = start; i <= end; i++) p.push(i);
    return p;
  }

  ngOnInit(): void {}

  onSearch(): void        { this.currentPage = 1; this.searchChange.emit(this.searchQuery); }
  onPageSizeChange(): void { this.currentPage = 1; this.pageChange.emit(1); }
  goToPage(p: number): void { this.currentPage = p; this.pageChange.emit(p); }

  sortBy(col: string): void {
    if (this.sortColumn === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortColumn = col; this.sortDir = 'asc'; }
    this.sortChange.emit({ column: this.sortColumn, dir: this.sortDir });
  }

  toggleAll(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    if (checked) this.data.forEach(r => this.selectedIds.add(r._id));
    else this.selectedIds.clear();
    this.selectionChange.emit([...this.selectedIds]);
  }

  toggleRow(id: string): void {
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
    this.selectionChange.emit([...this.selectedIds]);
  }

  trackId(_: number, row: any): string { return row._id; }

  getBadgeClass(col: TableColumn, val: string): string {
    if (col.badgeColors?.[val]) return col.badgeColors[val];
    return `badge-${val?.toLowerCase()}`;
  }
}
