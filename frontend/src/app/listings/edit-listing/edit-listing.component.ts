import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ListingService } from '../../services/listing.service';
import { AuthService }    from '../../services/auth.service';
import { Listing, ListingImage, LISTING_CATEGORIES, LISTING_CONDITIONS, OWNER_CLAIMS } from '../../models/listing.model';
import { CITY_NAMES, getAreasForCity } from '../../models/pakistan-locations';
import { OwnerLayoutComponent } from '../../modules/dashboard/owner-layout.component';

interface NewImagePreview { url: string; file: File; }

@Component({
  selector: 'app-edit-listing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, OwnerLayoutComponent],
  templateUrl: './edit-listing.component.html',
  styleUrls:   ['./edit-listing.component.css'],
})
export class EditListingComponent implements OnInit {
  categories      = [...LISTING_CATEGORIES];
  conditions      = [...LISTING_CONDITIONS];
  ownerClaimOptions = [...OWNER_CLAIMS];
  cityNames       = CITY_NAMES;
  availableAreas: string[] = [];

  listingId      = '';
  loadingListing = true;
  loadError      = '';

  form = {
    title:       '',
    description: '',
    category:    '',
    price:       null as number | null,
    priceUnit:   'per_day',
    securityDeposit: null as number | null,
    condition:   '' as string,
    brand:       '',
    model:       '',
    setupType:   '',
    includedItems: [] as string[],
    ownerClaims:   [] as string[],
    city:        '',
    area:        '',
    status:      'active',
  };

  includedItemDraft = '';

  existingImages:   ListingImage[] = [];
  retainedImageIds: Set<string>    = new Set();
  newImages:        NewImagePreview[] = [];
  isDragging        = false;
  submitting        = false;
  globalError       = '';
  globalSuccess     = '';
  errors: Record<string, string> = {};

  constructor(
    private route:          ActivatedRoute,
    private router:         Router,
    private listingService: ListingService,
    private authService:    AuthService,
  ) {}

  ngOnInit(): void {
    this.listingId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.listingId) {
      this.loadError      = 'Invalid listing ID.';
      this.loadingListing = false;
      return;
    }
    this.fetchListing();
  }

  fetchListing(): void {
    this.listingService.getListingById(this.listingId).subscribe({
      next: (res) => {
        const l = res.data.listing;

        // Ownership guard
        const userId  = (this.authService.currentUser as any)?.id
                     || (this.authService.currentUser as any)?._id;
        const ownerId = (l.createdBy as any)?._id
                     || (l.createdBy as any)?.id
                     || l.createdBy;
        if (userId !== ownerId) {
          this.loadError      = 'You are not authorised to edit this listing.';
          this.loadingListing = false;
          return;
        }

        this.form = {
          title:       l.title,
          description: l.description,
          category:    l.category,
          price:       l.price,
          priceUnit:   l.priceUnit,
          securityDeposit: (l as any).securityDeposit ?? null,
          condition:   (l as any).condition || '',
          brand:       (l as any).brand || '',
          model:       (l as any).model || '',
          setupType:   (l as any).setupType || '',
          includedItems: (l as any).includedItems ? [...(l as any).includedItems] : [],
          ownerClaims:   (l as any).ownerClaims   ? [...(l as any).ownerClaims]   : [],
          city:        l.city  || '',
          area:        l.area  || '',
          status:      l.status,
        };

        // Pre-load areas for the existing city
        if (l.city) {
          this.availableAreas = getAreasForCity(l.city);
        }

        this.existingImages   = l.images || [];
        this.retainedImageIds = new Set(this.existingImages.map(i => i.publicId));
        this.loadingListing   = false;
      },
      error: (err) => {
        this.loadError      = err.error?.message || 'Failed to load listing.';
        this.loadingListing = false;
      },
    });
  }

  // ── City change: reset area, load new area list ────────────────────────────
  onCityChange(): void {
    this.form.area      = '';
    this.availableAreas = getAreasForCity(this.form.city);
  }

  // ── Included items (chip list) ───────────────────────────────────────────
  addIncludedItem(): void {
    const v = this.includedItemDraft.trim();
    if (!v) return;
    if (this.form.includedItems.length >= 20) return;
    if (!this.form.includedItems.some(i => i.toLowerCase() === v.toLowerCase())) {
      this.form.includedItems.push(v);
    }
    this.includedItemDraft = '';
  }

  removeIncludedItem(index: number): void {
    this.form.includedItems.splice(index, 1);
  }

  // ── Owner claims (multi-select toggle) ───────────────────────────────────
  toggleOwnerClaim(claim: string): void {
    const i = this.form.ownerClaims.indexOf(claim);
    if (i === -1) this.form.ownerClaims.push(claim);
    else this.form.ownerClaims.splice(i, 1);
  }

  isOwnerClaimSelected(claim: string): boolean {
    return this.form.ownerClaims.includes(claim);
  }

  // ── Toggle retention of an existing Cloudinary image ──────────────────────
  toggleExistingImage(publicId: string): void {
    if (this.retainedImageIds.has(publicId)) {
      this.retainedImageIds.delete(publicId);
    } else {
      this.retainedImageIds.add(publicId);
    }
  }

  isImageRetained(publicId: string): boolean {
    return this.retainedImageIds.has(publicId);
  }

  // ── New image handling ─────────────────────────────────────────────────────
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.processFiles(Array.from(input.files));
    input.value = '';
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.isDragging = true; }
  onDrop(event: DragEvent): void {
    event.preventDefault(); this.isDragging = false;
    if (event.dataTransfer?.files) this.processFiles(Array.from(event.dataTransfer.files));
  }

  processFiles(files: File[]): void {
    this.errors['images'] = '';
    const allowed   = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize   = 5 * 1024 * 1024;
    const slotsLeft = 8 - this.retainedImageIds.size - this.newImages.length;

    if (files.length > slotsLeft) {
      this.errors['images'] = `Only ${slotsLeft} more image(s) allowed.`;
      files = files.slice(0, slotsLeft);
    }

    for (const file of files) {
      if (!allowed.includes(file.type)) { this.errors['images'] = 'Only JPEG, PNG, WebP allowed.'; continue; }
      if (file.size > maxSize)          { this.errors['images'] = `"${file.name}" exceeds 5MB.`; continue; }
      const reader = new FileReader();
      reader.onload = (e) => this.newImages.push({ url: e.target!.result as string, file });
      reader.readAsDataURL(file);
    }
  }

  removeNewImage(index: number): void { this.newImages.splice(index, 1); }

  // ── Validation ─────────────────────────────────────────────────────────────
  validate(): boolean {
    this.errors = {};
    const f = this.form;
    if (!f.title.trim())                this.errors['title']       = 'Title is required.';
    else if (f.title.trim().length < 5) this.errors['title']       = 'Minimum 5 characters.';
    if (!f.description.trim())          this.errors['description'] = 'Description is required.';
    else if (f.description.trim().length < 20) this.errors['description'] = 'Minimum 20 characters.';
    if (!f.category)                    this.errors['category']    = 'Please select a category.';
    const price = Number(f.price);
    if (!f.price && f.price !== 0)      this.errors['price']       = 'Price is required.';
    else if (price < 1)                 this.errors['price']       = 'Minimum Rs. 1.';
    else if (price > 999999)            this.errors['price']       = 'Maximum Rs. 999,999.';
    if (f.securityDeposit !== null && f.securityDeposit !== undefined) {
      const deposit = Number(f.securityDeposit);
      if (deposit < 0)            this.errors['securityDeposit'] = 'Cannot be negative.';
      else if (deposit > 999999)  this.errors['securityDeposit'] = 'Maximum Rs. 999,999.';
    }
    return Object.keys(this.errors).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  onSubmit(): void {
    this.globalError   = '';
    this.globalSuccess = '';
    if (!this.validate()) return;

    this.submitting = true;

    const fd = new FormData();
    fd.append('title',       this.form.title.trim());
    fd.append('description', this.form.description.trim());
    fd.append('category',    this.form.category);
    fd.append('price',       String(this.form.price));
    fd.append('priceUnit',   this.form.priceUnit);
    fd.append('securityDeposit', String(this.form.securityDeposit ?? 0));
    fd.append('condition', this.form.condition || '');
    fd.append('brand', this.form.brand.trim());
    fd.append('model', this.form.model.trim());
    fd.append('setupType', this.form.setupType.trim());
    fd.append('includedItems', JSON.stringify(this.form.includedItems));
    fd.append('ownerClaims', JSON.stringify(this.form.ownerClaims));
    fd.append('status',      this.form.status);
    if (this.form.city) fd.append('city', this.form.city);
    if (this.form.area) fd.append('area', this.form.area);

    fd.append('retainedImageIds', Array.from(this.retainedImageIds).join(','));

    for (const p of this.newImages) {
      fd.append('images', p.file, p.file.name);
    }

    this.listingService.updateListing(this.listingId, fd).subscribe({
      next: (res) => {
        this.submitting    = false;
        this.globalSuccess = res.message || 'Listing updated successfully!';
        setTimeout(() => this.router.navigate(['/listings', this.listingId]), 1200);
      },
      error: (err) => {
        this.submitting  = false;
        const body       = err.error;
        this.globalError = body?.message || 'Failed to update listing.';
        if (body?.errors) this.errors = { ...this.errors, ...body.errors };
      },
    });
  }

  goBack(): void { this.router.navigate(['/listings', this.listingId]); }
}
