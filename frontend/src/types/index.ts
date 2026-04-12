export interface EBook {
  id: string;
  title: string;
  author: string;
  description: string;
  cover_url: string;
  pdf_url: string;
  category: string;
  is_free?: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'expired' | 'pending';
  start_date: string | null;
  expiry_date: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  plan: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  user_metadata: {
    full_name: string;
  };
}

export interface AppSession {
  access_token: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  amount: number;
  duration_days: number;
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => void;
  prefill: {
    name: string;
    email: string;
  };
  theme: {
    color: string;
  };
  modal: {
    ondismiss: () => void;
  };
  method?: {
    card?: boolean;
    netbanking?: boolean;
    upi?: boolean;
    wallet?: boolean;
    paylater?: boolean;
  };
}

export interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error?: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void;
    };
  }
}
