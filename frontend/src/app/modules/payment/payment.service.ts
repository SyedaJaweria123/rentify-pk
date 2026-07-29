import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export type PaymentGateway = 'jazzcash' | 'easypaisa' | 'stripe' | 'bank_transfer' | 'cash_on_delivery';

export interface InitiatePayload {
  bookingId: string;
  gateway: PaymentGateway;
  paymentMethod?: 'MA' | 'OTC';   // easypaisa only
}

export interface BankDetails {
  referenceNumber: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  amount: number;
  instructions: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private api: ApiService) {}

  /** Start a payment via the chosen gateway. Returns gateway-specific data. */
  initiate(payload: InitiatePayload): Observable<any> {
    return this.api.post('/payments/initiate', payload);
  }

  /** Current payment + booking status for a booking. */
  getStatus(bookingId: string): Observable<any> {
    return this.api.get(`/payments/status/${bookingId}`);
  }

  /** Static list of supported Pakistani banks (no auth). */
  getSupportedBanks(): Observable<any> {
    return this.api.get('/payments/supported-banks');
  }

  /** Upload bank-transfer proof screenshot. */
  submitBankProof(formData: FormData): Observable<any> {
    return this.api.upload('/payments/bank-transfer/proof', formData);
  }
}
