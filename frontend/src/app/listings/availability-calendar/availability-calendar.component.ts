// src/app/listings/availability-calendar/availability-calendar.component.ts
/**
 * AvailabilityCalendarComponent — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable month-view calendar that shows a listing's availability:
 *   • available  (selectable, green tint)
 *   • booked     (confirmed/active — red, disabled)
 *   • pending    (amber, disabled)
 *   • blocked    (owner-blocked — grey, disabled)
 *   • past       (disabled)
 *
 * Data: GET /api/listings/:id/availability → { booked[], pending[], blocked[] }
 * Emits (startDate, endDate) when the user picks a valid range.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Component, Input, Output, EventEmitter, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface DayCell {
  date: Date;
  inMonth: boolean;
  state: 'available' | 'booked' | 'pending' | 'blocked' | 'past';
  selected: boolean;
  inRange: boolean;
}

@Component({
  selector: 'app-availability-calendar',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="cal">
    <!-- Header -->
    <div class="cal-head">
      <button class="cal-nav" (click)="prevMonth()" aria-label="Previous month">‹</button>
      <span class="cal-month">{{ monthLabel() }}</span>
      <button class="cal-nav" (click)="nextMonth()" aria-label="Next month">›</button>
    </div>

    <!-- Weekday labels -->
    <div class="cal-grid cal-weekdays">
      <span *ngFor="let d of weekdays">{{ d }}</span>
    </div>

    <!-- Days -->
    <div class="cal-grid" *ngIf="!loading()">
      <button *ngFor="let cell of days()"
        class="cal-day"
        [class.cal-out]="!cell.inMonth"
        [class.cal-available]="cell.state === 'available' && cell.inMonth"
        [class.cal-booked]="cell.state === 'booked'"
        [class.cal-pending]="cell.state === 'pending'"
        [class.cal-blocked]="cell.state === 'blocked'"
        [class.cal-past]="cell.state === 'past'"
        [class.cal-selected]="cell.selected"
        [class.cal-inrange]="cell.inRange"
        [disabled]="cell.state !== 'available' || !cell.inMonth"
        (click)="pickDate(cell)">
        {{ cell.date.getDate() }}
      </button>
    </div>

    <div class="cal-loading" *ngIf="loading()">Loading availability…</div>

    <!-- Legend -->
    <div class="cal-legend">
      <span><i class="dot dot-av"></i> Available</span>
      <span><i class="dot dot-bk"></i> Booked</span>
      <span><i class="dot dot-pd"></i> Pending</span>
      <span><i class="dot dot-bl"></i> Blocked</span>
    </div>

    <!-- Selection summary -->
    <div class="cal-selection" *ngIf="selStart()">
      <span>{{ selStart() | date:'mediumDate' }}</span>
      <span *ngIf="selEnd()"> → {{ selEnd() | date:'mediumDate' }}</span>
      <button class="cal-clear" (click)="clearSelection()">Clear</button>
    </div>
  </div>
  `,
  styles: [`
    :host { --primary:#00A651; --primary-l:#E8F8EF; --red:#FF4D4D; --amber:#FFB31A;
            --text:#1A1D1F; --text-2:#6F767E; --border:#EFEFEF; display:block; }
    .cal { border:1px solid var(--border); border-radius:14px; padding:14px; background:#fff; }
    .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
    .cal-month { font-weight:700; font-size:15px; color:var(--text); }
    .cal-nav { width:32px; height:32px; border-radius:8px; border:1px solid var(--border);
               background:#fff; cursor:pointer; font-size:18px; color:var(--text-2); }
    .cal-nav:hover { border-color:var(--primary); color:var(--primary); }
    .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
    .cal-weekdays { margin-bottom:6px; }
    .cal-weekdays span { text-align:center; font-size:11px; font-weight:700; color:var(--text-2); padding:4px 0; }
    .cal-day { aspect-ratio:1; border:none; border-radius:9px; background:#fff; cursor:pointer;
               font-size:13px; font-weight:600; color:var(--text); transition:background .15s,transform .1s; }
    .cal-out { visibility:hidden; }
    .cal-available:hover { background:var(--primary-l); transform:scale(1.05); }
    .cal-booked  { background:#FFEBEB; color:var(--red); cursor:not-allowed; text-decoration:line-through; }
    .cal-pending { background:#FFF6E5; color:#B45309; cursor:not-allowed; }
    .cal-blocked { background:#F1F1F1; color:#9A9FA5; cursor:not-allowed; }
    .cal-past    { color:#CBD0D5; cursor:not-allowed; }
    .cal-selected { background:var(--primary); color:#fff; }
    .cal-inrange  { background:var(--primary-l); }
    .cal-loading { text-align:center; padding:30px; color:var(--text-2); font-size:13px; }
    .cal-legend { display:flex; flex-wrap:wrap; gap:12px; margin-top:12px; padding-top:12px;
                  border-top:1px solid var(--border); font-size:11px; color:var(--text-2); }
    .cal-legend span { display:flex; align-items:center; gap:5px; }
    .dot { width:10px; height:10px; border-radius:3px; display:inline-block; }
    .dot-av { background:var(--primary-l); border:1px solid var(--primary); }
    .dot-bk { background:#FFEBEB; border:1px solid var(--red); }
    .dot-pd { background:#FFF6E5; border:1px solid var(--amber); }
    .dot-bl { background:#F1F1F1; border:1px solid #9A9FA5; }
    .cal-selection { margin-top:12px; padding:10px 12px; background:var(--primary-l);
                     border-radius:10px; font-size:13px; font-weight:600; color:var(--primary);
                     display:flex; align-items:center; gap:6px; }
    .cal-clear { margin-left:auto; background:none; border:none; color:var(--red);
                 font-size:12px; font-weight:700; cursor:pointer; }
  `],
})
export class AvailabilityCalendarComponent implements OnInit {
  @Input() listingId!: string;
  @Output() rangeSelected = new EventEmitter<{ start: Date; end: Date }>();

  private api = environment.apiUrl;
  weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  loading   = signal(true);
  viewDate  = signal(new Date());
  selStart  = signal<Date | null>(null);
  selEnd    = signal<Date | null>(null);

  private booked:  { start: Date; end: Date }[] = [];
  private pending: { start: Date; end: Date }[] = [];
  private blocked: Date[] = [];

  monthLabel = computed(() =>
    this.viewDate().toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }));

  days = computed<DayCell[]>(() => this.buildDays());

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.listingId) this.loadAvailability();
  }

  private loadAvailability(): void {
    this.loading.set(true);
    this.http.get<any>(`${this.api}/listings/${this.listingId}/availability`).subscribe({
      next: (res) => {
        const d = res.data || {};
        this.booked  = (d.booked  || []).map((r: any) => ({ start: new Date(r.start), end: new Date(r.end) }));
        this.pending = (d.pending || []).map((r: any) => ({ start: new Date(r.start), end: new Date(r.end) }));
        this.blocked = (d.blocked || []).map((x: any) => new Date(x));
        this.loading.set(false);
        this.viewDate.set(new Date(this.viewDate())); // trigger recompute
      },
      error: () => this.loading.set(false),
    });
  }

  private buildDays(): DayCell[] {
    const v = this.viewDate();
    const year = v.getFullYear(), month = v.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const cells: DayCell[] = [];
    // leading blanks
    for (let i = 0; i < startDay; i++) {
      cells.push({ date: new Date(year, month, i - startDay + 1), inMonth: false, state: 'past', selected: false, inRange: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      let state: DayCell['state'] = 'available';
      if (date < today) state = 'past';
      else if (this.isBlocked(date)) state = 'blocked';
      else if (this.inRanges(date, this.booked)) state = 'booked';
      else if (this.inRanges(date, this.pending)) state = 'pending';

      const ss = this.selStart(), se = this.selEnd();
      const selected = (ss && date.toDateString() === ss.toDateString()) ||
                       (se && date.toDateString() === se.toDateString()) || false;
      const inRange = !!(ss && se && date > ss && date < se);
      cells.push({ date, inMonth: true, state, selected: !!selected, inRange });
    }
    return cells;
  }

  private isBlocked(date: Date): boolean {
    return this.blocked.some(b => b.toDateString() === date.toDateString());
  }
  private inRanges(date: Date, ranges: { start: Date; end: Date }[]): boolean {
    return ranges.some(r => date >= this.stripTime(r.start) && date <= this.stripTime(r.end));
  }
  private stripTime(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  prevMonth(): void { const v = new Date(this.viewDate()); v.setMonth(v.getMonth() - 1); this.viewDate.set(v); }
  nextMonth(): void { const v = new Date(this.viewDate()); v.setMonth(v.getMonth() + 1); this.viewDate.set(v); }

  pickDate(cell: DayCell): void {
    if (cell.state !== 'available' || !cell.inMonth) return;
    const ss = this.selStart(), se = this.selEnd();
    if (!ss || (ss && se)) {
      // start fresh
      this.selStart.set(cell.date); this.selEnd.set(null);
    } else if (cell.date > ss) {
      // ensure no booked/blocked day falls inside the chosen range
      if (this.rangeHasConflict(ss, cell.date)) {
        this.selStart.set(cell.date); this.selEnd.set(null);
      } else {
        this.selEnd.set(cell.date);
        this.rangeSelected.emit({ start: ss, end: cell.date });
      }
    } else {
      this.selStart.set(cell.date); this.selEnd.set(null);
    }
    this.viewDate.set(new Date(this.viewDate())); // recompute highlight
  }

  private rangeHasConflict(start: Date, end: Date): boolean {
    const cur = new Date(start);
    while (cur <= end) {
      if (this.isBlocked(cur) || this.inRanges(cur, this.booked) || this.inRanges(cur, this.pending)) return true;
      cur.setDate(cur.getDate() + 1);
    }
    return false;
  }

  clearSelection(): void {
    this.selStart.set(null); this.selEnd.set(null);
    this.viewDate.set(new Date(this.viewDate()));
  }
}
