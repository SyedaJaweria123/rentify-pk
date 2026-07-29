import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export interface WithdrawalPayload {
  amount: number;
  method: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  accountNumber: string;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  constructor(private api: ApiService) {}

  getSummary(): Observable<any> {
    return this.api.get('/wallet/summary');
  }

  getBalance(): Observable<any> {
    return this.api.get('/wallet/balance');
  }

  getTransactions(params: { page?: number; limit?: number; type?: string; sort?: string } = {}): Observable<any> {
    return this.api.get('/wallet/transactions', params as any);
  }

  withdraw(payload: WithdrawalPayload): Observable<any> {
    return this.api.post('/wallet/withdraw', payload);
  }
}