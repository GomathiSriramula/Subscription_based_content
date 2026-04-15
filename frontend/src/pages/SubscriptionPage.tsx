import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, CreditCard, Crown, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { RazorpayPaymentResponse, SubscriptionPlan } from '../types';

interface SubscriptionPageProps {
  onNavigate: (page: string) => void;
}

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`)) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function SubscriptionPage({ onNavigate }: SubscriptionPageProps) {
  const { session, user, subscription, isSubscribed, refreshSubscription } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const payload = await apiRequest<{ data: SubscriptionPlan[] }>('/api/plans');
        setPlans(payload.data);
        if (payload.data.length > 0) {
          setSelectedPlanId(payload.data[0].id);
        }
      } catch {
        setPlans([]);
      } finally {
        setLoadingPlans(false);
      }
    };

    loadPlans();
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleSubscribe = useCallback(async () => {
    setPaymentError('');
    setPaymentSuccess('');
    setPaymentLoading(true);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setPaymentError('Failed to load payment gateway. Please try again.');
      setPaymentLoading(false);
      return;
    }

    if (!session?.access_token) {
      setPaymentError('Please sign in again to continue.');
      setPaymentLoading(false);
      return;
    }

    if (!selectedPlanId) {
      setPaymentError('No subscription plan available. Please contact admin.');
      setPaymentLoading(false);
      return;
    }

    let orderData: { keyId: string; amount: number; currency: string; orderId: string };
    try {
      orderData = await apiRequest('/api/payments/create-order', {
        method: 'POST',
        token: session.access_token,
        body: { plan: selectedPlanId },
      });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Failed to create order.');
      setPaymentLoading(false);
      return;
    }

    setPaymentLoading(false);

    const isTestMode = orderData.keyId.startsWith('rzp_test_');

    const options = {
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'PageVault',
      description: `${selectedPlan?.name || 'Subscription'} Plan`,
      order_id: orderData.orderId,
      handler: async (response: RazorpayPaymentResponse) => {
        setPaymentLoading(true);
        try {
          const verifyData = await apiRequest<{ success: boolean; error?: string }>('/api/payments/verify', {
            method: 'POST',
            token: session.access_token,
            body: response,
          });

          if (verifyData.success) {
            setPaymentSuccess('Subscription activated! Enjoy unlimited reading.');
            await refreshSubscription();
          } else {
            setPaymentError(verifyData.error || 'Payment verification failed.');
          }
        } catch (error) {
          setPaymentError(error instanceof Error ? error.message : 'Payment verification failed.');
        } finally {
          setPaymentLoading(false);
        }
      },
      prefill: {
        name: user?.user_metadata?.full_name || '',
        email: user?.email || '',
      },
      theme: { color: '#f59e0b' },
      modal: {
        ondismiss: () => {
          setPaymentLoading(false);
        },
      },
      method: isTestMode
        ? {
            card: false,
            netbanking: true,
            upi: true,
            wallet: true,
            paylater: true,
          }
        : undefined,
    };

    if (!window.Razorpay) {
      setPaymentError('Razorpay SDK is unavailable. Please refresh and try again.');
      return;
    }

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      const description = response?.error?.description || 'Payment failed. Please try another method.';
      const unsupportedInternational = description.toLowerCase().includes('international cards are not supported');

      setPaymentError(
        unsupportedInternational
          ? 'Cards are disabled in test mode for this account. Please pay using Netbanking, UPI, Wallet, or Pay Later.'
          : description
      );
      setPaymentLoading(false);
    });
    rzp.open();
  }, [session, user, selectedPlanId, selectedPlan, refreshSubscription]);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Subscription Plans</h1>
          <p className="text-slate-400 text-sm">Choose a plan to unlock the full library and pay securely with Razorpay.</p>
        </div>

        {isSubscribed && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="text-emerald-400 mt-0.5" />
              <div>
                <h2 className="text-white font-semibold mb-1">You already have an active plan</h2>
                <p className="text-slate-300 text-sm">
                  Plan: <span className="text-amber-400 capitalize">{subscription?.plan || 'N/A'}</span> | Expires: {formatDate(subscription?.expiry_date ?? null)}
                </p>
              </div>
            </div>
          </div>
        )}

        {paymentError && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            <AlertCircle size={16} className="shrink-0" />
            {paymentError}
          </div>
        )}

        {paymentSuccess && (
          <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm px-4 py-3 rounded-lg mb-4">
            <CheckCircle size={16} className="shrink-0" />
            {paymentSuccess}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
          {loadingPlans ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-44 bg-slate-800 border border-slate-700 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <p className="text-slate-400 text-sm">No plans are available right now. Please contact admin.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {plans.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`relative rounded-xl border p-5 text-left transition-all ${
                      selectedPlanId === plan.id
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-semibold capitalize">{plan.name}</p>
                      <Crown size={16} className={selectedPlanId === plan.id ? 'text-amber-400' : 'text-slate-500'} />
                    </div>
                    <p className="text-3xl font-bold text-amber-400">₹{Math.round(plan.amount / 100).toLocaleString('en-IN')}</p>
                    <p className="text-slate-400 text-sm mt-1">{plan.duration_days} days access</p>
                  </button>
                ))}
              </div>

              <button
                onClick={handleSubscribe}
                disabled={paymentLoading || !selectedPlanId}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-900 font-semibold py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/25 flex items-center justify-center gap-2"
              >
                {paymentLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard size={18} />
                    Pay with Razorpay
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-5 mt-4 flex-wrap">
                {['Price transparency', 'Flexible duration', 'Secure Razorpay checkout'].map((feature) => (
                  <div key={feature} className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Zap size={11} className="text-amber-500" />
                    {feature}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={() => onNavigate('dashboard')}
            className="text-sm text-amber-400 hover:text-amber-300 font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}