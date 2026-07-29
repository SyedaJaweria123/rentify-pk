import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// ── Custom Validators ─────────────────────────────────────────────────────────

export function pakistaniPhone(): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value?.toString().trim();
    if (!val) return null;
    return /^03[0-9]{9}$/.test(val) ? null : { pakistaniPhone: true };
  };
}

export function cnicFormat(): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value?.toString().trim();
    if (!val) return null;
    return /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(val) ? null : { cnicFormat: true };
  };
}

export function passwordStrength(): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value;
    if (!val) return null;
    const errors: Record<string, boolean> = {};
    if (val.length < 8)              errors['minLength']  = true;
    if (!/[A-Z]/.test(val))          errors['uppercase']  = true;
    if (!/[a-z]/.test(val))          errors['lowercase']  = true;
    if (!/[0-9]/.test(val))          errors['number']     = true;
    return Object.keys(errors).length ? { passwordStrength: errors } : null;
  };
}

export function mustMatch(controlName: string, matchControlName: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const ctrl  = group.get(controlName);
    const match = group.get(matchControlName);
    if (!ctrl || !match) return null;
    if (ctrl.value !== match.value) {
      match.setErrors({ mustMatch: true });
      return { mustMatch: true };
    }
    const err = match.errors ? { ...match.errors } : null;
    if (err) delete err['mustMatch'];
    match.setErrors(Object.keys(err || {}).length ? err : null);
    return null;
  };
}

export function noWhitespace(): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = ctrl.value;
    if (!val) return null;
    return val.trim().length === 0 ? { noWhitespace: true } : null;
  };
}

export function minPrice(min: number): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const val = Number(ctrl.value);
    if (!val) return null;
    return val < min ? { minPrice: { min, actual: val } } : null;
  };
}

// ── Error Message Helper ──────────────────────────────────────────────────────

export function getErrorMessage(control: AbstractControl | null, fieldName = 'Field'): string {
  if (!control?.errors || !control.touched) return '';
  const e = control.errors;

  if (e['required'])        return `${fieldName} is required`;
  if (e['email'])           return 'Enter a valid email address';
  if (e['minlength'])       return `Minimum ${e['minlength'].requiredLength} characters required`;
  if (e['maxlength'])       return `Maximum ${e['maxlength'].requiredLength} characters allowed`;
  if (e['min'])             return `Minimum value is ${e['min'].min}`;
  if (e['max'])             return `Maximum value is ${e['max'].max}`;
  if (e['pakistaniPhone'])  return 'Enter valid Pakistani number (03XXXXXXXXX)';
  if (e['cnicFormat'])      return 'Enter CNIC as: XXXXX-XXXXXXX-X';
  if (e['mustMatch'])       return 'Passwords do not match';
  if (e['noWhitespace'])    return `${fieldName} cannot be empty spaces`;
  if (e['passwordStrength']) {
    const s = e['passwordStrength'];
    if (s['minLength'])  return 'Password must be at least 8 characters';
    if (s['uppercase'])  return 'Add at least one uppercase letter';
    if (s['number'])     return 'Add at least one number';
  }
  if (e['minPrice'])        return `Minimum price is Rs. ${e['minPrice'].min}`;
  if (e['pattern'])         return `${fieldName} format is invalid`;

  return 'Invalid value';
}

// ── Password Strength Meter ───────────────────────────────────────────────────

export function getPasswordStrength(password: string): {
  score: number; label: string; color: string;
} {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8)    score++;
  if (password.length >= 12)   score++;
  if (/[A-Z]/.test(password))  score++;
  if (/[a-z]/.test(password))  score++;
  if (/[0-9]/.test(password))  score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak',   color: 'bg-red-500' };
  if (score <= 4) return { score, label: 'Medium', color: 'bg-yellow-500' };
  return               { score, label: 'Strong', color: 'bg-green-500' };
}
