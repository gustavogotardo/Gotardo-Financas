export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  REVIEW = 'REVIEW',
}

export enum TransactionSource {
  MANUAL = 'MANUAL',
  IMPORT = 'IMPORT',
  RECURRING = 'RECURRING',
  OCR = 'OCR',
}

export enum AccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  INVESTMENT = 'INVESTMENT',
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum PaymentMethod {
  PIX = 'PIX',
  BOLETO = 'BOLETO',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  TRANSFER = 'TRANSFER',
  CASH = 'CASH',
  OTHER = 'OTHER',
}

export enum Currency {
  BRL = 'BRL',
}

export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
  };
};

export type ApiErrorEnvelope = {
  error: ApiError;
  meta?: {
    requestId: string;
    timestamp: string;
  };
};

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export type NormalizedTransaction = {
  id?: string;
  externalId?: string;
  date: string;
  description: string;
  amount: string;
  type: TransactionType;
  accountId?: string;
  institution?: string;
  category?: string;
  subcategory?: string;
  paymentMethod?: string;
  sourceDocumentId?: string;
  status: TransactionStatus;
};
