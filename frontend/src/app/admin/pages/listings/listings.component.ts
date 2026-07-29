// src/app/admin/pages/listings/listings.component.ts
/**
 * Admin · Listings Management — Rentify PK
 * Uses DataTableComponent + ToastService. Custom confirm modal (no browser confirm).
 * Styling via CSS variables → matches the active theme automatically.
 */
import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { AdminService } from '../../services/admin.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { DataTableComponent, TableColumn } from '../../components/data-table/data-table.component';

@Component({
  selector: 'app-admin-listings',
  standalone: true,
  imports: [CommonModule, FormsModule, DataTableComponent],
  templateUrl: './listings.component.html',
  styleUrls: ['./listings.component.css'],
})
export class AdminListingsComponent implements OnInit {
  private adminSvc = inject(AdminService);
  private toast    = inject(ToastService);

  data: any[] = [];
  total = 0;
  loading = true;

  // Filters / paging
  search = '';
  statusFilter = '';
  categoryFilter = '';
  page = 1;
  limit = 10;

  readonly categories = ['Electronics', 'Vehicles', 'Furniture', 'Cameras', 'Sports', 'Tools', 'Events'];
  readonly statuses   = ['active', 'inactive', 'pending', 'rejected', 'suspended'];

  // Detail modal
  showModal = false;
  selectedListing: any = null;

  // Custom confirm-delete modal
  pendingDelete: any = null;
  showConfirm = false;

  // ── Real platform-wide stats (from backend, not page-scoped) ────────────────
  stats = { active: 0, inactive: 0, totalViews: 0, total: 0 };
  get statActive():   number { return this.stats.active; }
  get statInactive(): number { return this.stats.inactive; }
  get statViews():    number { return this.stats.totalViews; }

  // ── Image lightbox (for detail modal) ───────────────────────────────────────
  lightboxOpen = false;
  lightboxImages: string[] = [];
  lightboxIndex = 0;
  lightboxZoom = 1;
  openLightbox(imgs: string[], i = 0): void {
    const list = (imgs || []).filter(u => !!u);
    if (!list.length) return;
    this.lightboxImages = list; this.lightboxIndex = i; this.lightboxZoom = 1; this.lightboxOpen = true;
  }
  closeLightbox(): void { this.lightboxOpen = false; this.lightboxZoom = 1; }
  lbNext(e?: Event): void { if (e) e.stopPropagation(); this.lightboxIndex = (this.lightboxIndex + 1) % this.lightboxImages.length; this.lightboxZoom = 1; }
  lbPrev(e?: Event): void { if (e) e.stopPropagation(); this.lightboxIndex = (this.lightboxIndex - 1 + this.lightboxImages.length) % this.lightboxImages.length; this.lightboxZoom = 1; }
  lbZoomIn(e?: Event):  void { if (e) e.stopPropagation(); this.lightboxZoom = Math.min(this.lightboxZoom + 0.4, 3); }
  lbZoomOut(e?: Event): void { if (e) e.stopPropagation(); this.lightboxZoom = Math.max(this.lightboxZoom - 0.4, 1); }

  private searchSubject = new Subject<string>();

  // Table columns
  columns: TableColumn[] = [
    { key: 'image',     label: 'Image',    type: 'image' },
    { key: 'title',     label: 'Title',    type: 'text' },
    { key: 'city',      label: 'City',     type: 'text' },
    { key: 'ownerName', label: 'Owner',    type: 'text' },
    { key: 'category',  label: 'Category', type: 'text' },
    { key: 'price',     label: 'Price/day',type: 'currency' },
    { key: 'status',    label: 'Status',   type: 'badge' },
    { key: 'views',     label: 'Views',    type: 'text' },
    { key: 'createdAt', label: 'Created',  type: 'date' },
    { key: '_id',       label: 'Actions',  type: 'actions' },
  ];

  ngOnInit(): void {
    this.searchSubject.pipe(debounceTime(400)).subscribe(() => { this.page = 1; this.load(); });
    this.load();
  }

  load(): void {
    this.loading = true;
    this.adminSvc.getListings({
      page: this.page, limit: this.limit,
      search: this.search, category: this.categoryFilter, status: this.statusFilter,
    }).subscribe({
      next: (res: any) => {
        const d = res.data || {};
        this.data = (d.listings || []).map((l: any) => ({
          _id: l._id,
          image: l.coverImage || l.images?.[0]?.url || l.images?.[0] || '',
          title: l.title || '',
          city: l.location?.city || l.city || '—',
          ownerName: l.createdBy?.name || 'Unknown',
          category: l.category || '',
          price: l.price || 0,
          status: l.status || '',
          views: l.views || 0,
          createdAt: l.createdAt,
          bookingsCount: l.bookingsCount || l.bookings || 0,
          description: l.description || '',
        }));
        this.total = d.pagination?.total || this.data.length;
        this.stats = d.stats || { active: 0, inactive: 0, totalViews: 0, total: this.total };
        this.loading = false;
      },
      error: () => { this.loading = false; this.toast.error('Load Failed', 'Could not load listings.'); },
    });
  }

  onSearch(q: string): void { this.search = q; this.searchSubject.next(q); }
  onPageChange(p: number): void { this.page = p; this.load(); }

  onView(item: any): void { this.selectedListing = item; this.showModal = true; }
  closeModal(): void { this.showModal = false; this.selectedListing = null; }

  // ── Status update (with toast) ──────────────────────────────────────────────
  updateStatus(id: string, status: string): void {
    this.adminSvc.updateListingStatus(id, status).subscribe({
      next: () => {
        this.toast.success('Status Updated', 'Listing marked as ' + status + '.');
        this.closeModal();
        this.load();
      },
      error: () => this.toast.error('Update Failed', 'Could not update status.'),
    });
  }

  // ── Custom confirm-delete (no browser confirm) ───────────────────────────────
  onDelete(item: any): void { this.confirmDelete(item); }
  confirmDelete(item: any): void { this.pendingDelete = item; this.showConfirm = true; }
  cancelDelete(): void { this.pendingDelete = null; this.showConfirm = false; }
  executeDelete(): void {
    if (!this.pendingDelete) return;
    const title = this.pendingDelete.title;
    this.adminSvc.deleteListing(this.pendingDelete._id).subscribe({
      next: () => {
        this.toast.success('Listing Deleted', '"' + title + '" has been removed.');
        this.cancelDelete();
        this.load();
      },
      error: () => this.toast.error('Delete Failed', 'Could not delete this listing.'),
    });
  }

  // ── CSV export ────────────────────────────────────────────────────────────────
  onExport(): void {
    if (!this.data.length) { this.toast.warning('Nothing to Export', 'No listings to export.'); return; }
    const headers = ['Title','Owner','Category','City','Price/day','Status','Views','Created'];
    const rows = this.data.map((l: any) => [
      '"' + (l.title || '') + '"',
      l.ownerName || '', l.category || '', l.city || '',
      l.price || 0, l.status || '', l.views || 0,
      new Date(l.createdAt).toLocaleDateString('en-PK'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'listings-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Export Complete', rows.length + ' listings exported.');
  }

  // ── Escape closes modals ────────────────────────────────────────────────────
  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.lightboxOpen) { this.closeLightbox(); return; } this.closeModal(); this.cancelDelete(); }

  @HostListener('document:keydown.arrowright')
  onArrowRight(): void { if (this.lightboxOpen) this.lbNext(); }
  @HostListener('document:keydown.arrowleft')
  onArrowLeft(): void { if (this.lightboxOpen) this.lbPrev(); }
}
