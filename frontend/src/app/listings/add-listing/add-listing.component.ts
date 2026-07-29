import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ListingService } from '../../services/listing.service';
import { LISTING_CATEGORIES, LISTING_CONDITIONS, OWNER_CLAIMS } from '../../models/listing.model';
import { CITY_NAMES, getAreasForCity } from '../../models/pakistan-locations';
import { coordsForCity } from '../../models/pk-city-coords';
import { OwnerLayoutComponent } from '../../modules/dashboard/owner-layout.component';

/** Preview entry — holds the data URL for display and the File for upload */
interface ImagePreview { url: string; file: File; }

@Component({
  selector: 'app-add-listing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, OwnerLayoutComponent],
  templateUrl: './add-listing.component.html',
  styleUrls: ['./add-listing.component.css'],
})
export class AddListingComponent implements OnInit {
  categories      = [...LISTING_CATEGORIES];
  conditions      = [...LISTING_CONDITIONS];
  ownerClaimOptions = [...OWNER_CLAIMS];
  cityNames       = CITY_NAMES;
  availableAreas: string[] = [];

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
    size:        '',
    includedItems: [] as string[],
    ownerClaims:   [] as string[],
    city:        '',
    area:        '',
    status:      'active',
  };

  // Standard clothing sizes — the Size field only shows when the selected
  // category is Clothing & Accessories (see isClothingCategory below).
  readonly sizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'];

  get isClothingCategory(): boolean {
    return this.form.category === 'Clothing & Accessories';
  }

  // Draft text for the "add included item" input — not part of the
  // submitted form itself, just the staging field for the chip-list UI.
  includedItemDraft = '';

  imagePreviews: ImagePreview[] = [];
  isDragging    = false;
  submitting    = false;
  globalError   = '';
  globalSuccess = '';
  errors: Record<string, string> = {};

  constructor(
    private listingService: ListingService,
    private router: Router,
  ) {}

  ngOnInit(): void {}

  // ── When city changes, reset area and load areas for selected city ──────────
  onCityChange(): void {
    this.form.area      = '';
    this.availableAreas = getAreasForCity(this.form.city);
  }

  // ── Image handling ──────────────────────────────────────────────────────────
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.processFiles(Array.from(input.files));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files) {
      this.processFiles(Array.from(event.dataTransfer.files));
    }
  }

  processFiles(files: File[]): void {
    this.errors['images'] = '';
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;
    const remaining = 8 - this.imagePreviews.length;

    if (files.length > remaining) {
      this.errors['images'] = `You can only add ${remaining} more image(s). Maximum is 8.`;
      files = files.slice(0, remaining);
    }

    for (const file of files) {
      if (!allowed.includes(file.type)) {
        this.errors['images'] = 'Only JPEG, PNG, and WebP images are allowed.';
        continue;
      }
      if (file.size > maxSize) {
        this.errors['images'] = `"${file.name}" exceeds the 5MB limit.`;
        continue;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreviews.push({ url: e.target!.result as string, file });
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage(index: number): void {
    this.imagePreviews.splice(index, 1);
  }

  // ── Frontend validation ─────────────────────────────────────────────────────
  validate(): boolean {
    this.errors = {};
    const f = this.form;

    if (!f.title.trim())                this.errors['title']       = 'Title is required.';
    else if (f.title.trim().length < 5) this.errors['title']       = 'Title must be at least 5 characters.';

    if (!f.description.trim())          this.errors['description'] = 'Description is required.';
    else if (f.description.trim().length < 20) this.errors['description'] = 'Description must be at least 20 characters.';

    if (!f.category)                    this.errors['category']    = 'Please select a category.';

    if (f.price === null || f.price === undefined || (f.price as any) === '') {
      this.errors['price'] = 'Price is required.';
    } else if (Number(f.price) < 1) {
      this.errors['price'] = 'Price must be at least Rs. 1.';
    } else if (Number(f.price) > 999999) {
      this.errors['price'] = 'Price cannot exceed Rs. 999,999.';
    }

    if (f.securityDeposit !== null && f.securityDeposit !== undefined && (f.securityDeposit as any) !== '') {
      const deposit = Number(f.securityDeposit);
      if (deposit < 0)           this.errors['securityDeposit'] = 'Cannot be negative.';
      else if (deposit > 999999) this.errors['securityDeposit'] = 'Maximum Rs. 999,999.';
    }

    return Object.keys(this.errors).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
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
    if (this.form.condition) fd.append('condition', this.form.condition);
    if (this.form.brand.trim()) fd.append('brand', this.form.brand.trim());
    if (this.form.model.trim()) fd.append('model', this.form.model.trim());
    if (this.form.setupType.trim()) fd.append('setupType', this.form.setupType.trim());
    if (this.form.size.trim()) fd.append('size', this.form.size.trim());
    fd.append('includedItems', JSON.stringify(this.form.includedItems));
    fd.append('ownerClaims', JSON.stringify(this.form.ownerClaims));
    fd.append('status',      this.form.status);

    // Auto-set coordinates from city for map display
    const coords = coordsForCity(this.form.city);
    if (coords) {
      fd.append('lat', String(coords.lat));
      fd.append('lng', String(coords.lng));
    }
    if (this.form.city) fd.append('city', this.form.city);
    if (this.form.area) fd.append('area', this.form.area);

    for (const p of this.imagePreviews) {
      fd.append('images', p.file, p.file.name);
    }

    this.listingService.createListing(fd).subscribe({
      next: (res) => {
        this.submitting    = false;
        this.globalSuccess = res.message || 'Listing created successfully!';
        const id = res.data.listing.id || res.data.listing._id;
        setTimeout(() => this.router.navigate(['/listings', id]), 1200);
      },
      error: (err) => {
        this.submitting  = false;
        const body       = err.error;
        this.globalError = body?.message || 'Failed to create listing.';
        if (body?.errors) this.errors = { ...this.errors, ...body.errors };
      },
    });
  }

  goBack(): void { this.router.navigate(['/listings']); }

  // ── Character counters ────────────────────────────────────────────────────
  get titleLength():       number { return this.form.title?.trim().length || 0; }
  get descLength():        number { return this.form.description?.trim().length || 0; }
  readonly titleMax = 100;
  readonly descMax  = 2000;

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

  // ── Blur validation for individual fields ─────────────────────────────────
  onBlur(field: string): void {
    const f = this.form;
    switch (field) {
      case 'title':
        if (!f.title?.trim())             this.errors['title'] = 'Title is required.';
        else if (f.title.trim().length < 5) this.errors['title'] = 'Title must be at least 5 characters.';
        else if (f.title.trim().length > this.titleMax) this.errors['title'] = `Max ${this.titleMax} characters.`;
        else delete this.errors['title'];
        break;
      case 'description':
        if (!f.description?.trim())             this.errors['description'] = 'Description is required.';
        else if (f.description.trim().length < 20) this.errors['description'] = 'Description must be at least 20 characters.';
        else delete this.errors['description'];
        break;
      case 'price':
        if (!f.price && f.price !== 0) this.errors['price'] = 'Price is required.';
        else if (Number(f.price) < 1)  this.errors['price'] = 'Price must be at least PKR 1.';
        else if (Number(f.price) > 999999) this.errors['price'] = 'Price cannot exceed PKR 999,999.';
        else delete this.errors['price'];
        break;
      case 'securityDeposit':
        if (f.securityDeposit !== null && (f.securityDeposit as any) !== '') {
          if (Number(f.securityDeposit) < 0) this.errors['securityDeposit'] = 'Cannot be negative.';
          else if (Number(f.securityDeposit) > 999999) this.errors['securityDeposit'] = 'Maximum PKR 999,999.';
          else delete this.errors['securityDeposit'];
        } else {
          delete this.errors['securityDeposit'];
        }
        break;
      case 'city':
        if (!f.city?.trim()) this.errors['city'] = 'City is required.';
        else delete this.errors['city'];
        break;
    }
  }

}