export interface EBook {
  id: string;
  title: string;
  author: string;
  description: string;
  cover_url: string;
  pdf_url: string;
  category: string;
  is_free?: boolean;
  featured?: boolean;
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

export interface PaymentTransaction {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  plan_id: string | null;
  plan_name: string;
  amount_paise: number;
  amount_inr: number;
  payment_date: string | null;
  status: string;
  razorpay_payment_id: string | null;
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
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

export interface ChartPoint {
  label: string;
  value: number;
}

export interface RevenueChartPoint {
  label: string;
  value_paise: number;
  value_inr: number;
}

export interface AdminAnalytics {
  totals: {
    total_users: number;
    total_books: number;
    active_subscriptions: number;
    total_revenue_paise: number;
    total_revenue_inr: number;
    monthly_revenue_paise: number;
    monthly_revenue_inr: number;
  };
  charts: {
    revenue_last_6_months: RevenueChartPoint[];
    subscriptions_last_6_months: ChartPoint[];
  };
  notifications: {
    window_days: number;
    new_users_count: number;
    new_subscriptions_count: number;
    recent_users: {
      id: string;
      name: string;
      email: string;
      created_at: string | null;
    }[];
    recent_subscriptions: {
      id: string;
      user_name: string;
      user_email: string;
      plan_name: string;
      amount_inr: number;
      created_at: string | null;
    }[];
  };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'user' | 'admin';
  createdAt: string;
  is_blocked: boolean;
  blocked_at: string | null;
  subscription_status: 'active' | 'pending' | 'expired' | 'none';
  subscription_plan: string | null;
  subscription_expiry_date: string | null;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void;
    };
  }
}
