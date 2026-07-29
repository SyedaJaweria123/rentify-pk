export type TransactionType =
  | 'booking_payment' | 'earning' | 'service_fee'
  | 'deposit' | 'refund' | 'withdrawal' | 'adjustment';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Transaction {
  _id:         string;
  user:        string;
  type:        TransactionType;
  amount:      number;
  balance:     number;
  status:      TransactionStatus;
  description: string;
  booking?:    string;
  listing?:    string;
  createdAt:   string;
}

export interface WalletSummary {
  balance:         number;
  totalEarned:     number;
  totalWithdrawn:  number;
  pendingEarnings: number;
}

export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  booking_payment: 'Booking Payment',
  earning:         'Earning',
  service_fee:     'Service Fee',
  deposit:         'Deposit',
  refund:          'Refund',
  withdrawal:      'Withdrawal',
  adjustment:      'Adjustment',
};

export const TX_TYPE_COLORS: Record<TransactionType, string> = {
  booking_payment: 'text-red-600',
  earning:         'text-green-600',
  service_fee:     'text-orange-600',
  deposit:         'text-blue-600',
  refund:          'text-teal-600',
  withdrawal:      'text-red-500',
  adjustment:      'text-purple-600',
};
