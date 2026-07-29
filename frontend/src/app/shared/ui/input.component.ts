import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => InputComponent),
    multi: true,
  }],
  template: `
    <div class="w-full">
      <label *ngIf="label" [for]="id"
        class="block text-sm font-semibold text-gray-700 mb-1.5">
        {{ label }}
        <span *ngIf="required" class="text-red-500 ml-0.5">*</span>
      </label>

      <div class="relative">
        <!-- Prefix Icon -->
        <div *ngIf="prefixIcon" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <span class="text-base">{{ prefixIcon }}</span>
        </div>

        <input
          [id]="id"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [maxlength]="maxlength || 999"
          [value]="value"
          (input)="onInput($event)"
          (blur)="onTouched()"
          class="w-full py-2.5 border-2 rounded-xl text-sm text-gray-900 placeholder-gray-400 bg-gray-50 focus:bg-white outline-none transition-all"
          [class.pl-10]="prefixIcon"
          [class.pl-4]="!prefixIcon"
          [class.pr-10]="suffixIcon || type === 'password'"
          [class.pr-4]="!suffixIcon && type !== 'password'"
          [class.border-red-400]="error"
          [class.border-green-400]="isValid && touched"
          [class.border-gray-200]="!error && !(isValid && touched)"
          [class.focus:border-red-500]="error"
          [class.focus:border-indigo-500]="!error"
          [class.opacity-60]="disabled"
          [class.cursor-not-allowed]="disabled">

        <!-- Suffix / Password Toggle -->
        <div class="absolute right-3 top-1/2 -translate-y-1/2">
          <span *ngIf="suffixIcon && type !== 'password'" class="text-gray-400 text-base">{{ suffixIcon }}</span>
          <button *ngIf="type === 'password' || _showPasswordToggle" type="button"
            (click)="togglePassword()"
            class="text-gray-400 hover:text-gray-600 transition-colors text-xs">
            {{ showPassword ? '🙈' : '👁️' }}
          </button>
        </div>
      </div>

      <!-- Hint or Error -->
      <p *ngIf="error" class="mt-1 text-xs text-red-500 flex items-center gap-1">
        <span>⚠</span> {{ error }}
      </p>
      <p *ngIf="!error && isValid && touched" class="mt-1 text-xs text-green-600 flex items-center gap-1">
        <span>✓</span> Looks good!
      </p>
      <p *ngIf="hint && !error" class="mt-1 text-xs text-gray-400">{{ hint }}</p>
    </div>
  `,
})
export class InputComponent implements ControlValueAccessor {
  @Input() label       = '';
  @Input() id          = Math.random().toString(36).slice(2);
  @Input() type        = 'text';
  @Input() placeholder = '';
  @Input() required    = false;
  @Input() disabled    = false;
  @Input() error       = '';
  @Input() hint        = '';
  @Input() prefixIcon  = '';
  @Input() suffixIcon  = '';
  @Input() maxlength?: number;
  @Input() isValid     = false;

  value        = '';
  touched      = false;
  showPassword = false;
  _showPasswordToggle = false;

  private onChange = (_: any) => {};
  onTouched = () => { this.touched = true; };

  writeValue(val: any): void { this.value = val ?? ''; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; }

  onInput(e: Event): void {
    this.value = (e.target as HTMLInputElement).value;
    this.onChange(this.value);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
    this._showPasswordToggle = true;
  }
}
