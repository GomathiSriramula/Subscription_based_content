import { BookOpen, Lock, Zap, Star, ArrowRight, Shield, Smartphone } from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Vast Library',
    description: 'Access hundreds of curated eBooks across all genres and topics.',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
  },
  {
    icon: Lock,
    title: 'Secure Access',
    description: 'Your subscription protects premium content with JWT authentication.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Zap,
    title: 'Instant Reading',
    description: 'Built-in PDF viewer — no downloads needed, read right in your browser.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Shield,
    title: 'Safe Payments',
    description: 'Powered by Razorpay — industry-grade encryption for every transaction.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
  {
    icon: Smartphone,
    title: 'Read Anywhere',
    description: 'Fully responsive design works seamlessly on all your devices.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    icon: Star,
    title: 'Curated Content',
    description: 'Every book is hand-picked by our editorial team for quality.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
  },
];

export default function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="min-h-screen bg-slate-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-sky-500/5 pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            <Star size={13} />
            Trusted by 10,000+ readers worldwide
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6 tracking-tight">
            Your Digital
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              Reading Vault
            </span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            Unlimited access to a curated library of eBooks. Subscribe once and read everything,
            anywhere, on any device.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('register')}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-8 py-4 rounded-xl text-base transition-all hover:shadow-2xl hover:shadow-amber-500/30 hover:-translate-y-0.5"
            >
              Start Reading Today
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-medium px-8 py-4 rounded-xl text-base border border-slate-700 hover:border-slate-500 transition-all"
            >
              Sign In
            </button>
          </div>

          <div className="flex items-center justify-center gap-8 mt-12 text-sm text-slate-500">
            <div className="flex items-center gap-1.5"><Zap size={13} className="text-amber-500" /> Starting ₹299/mo</div>
            <div className="flex items-center gap-1.5"><Shield size={13} className="text-emerald-500" /> Cancel anytime</div>
            <div className="flex items-center gap-1.5"><Lock size={13} className="text-sky-500" /> Secure checkout</div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">Everything you need to read</h2>
          <p className="text-slate-400">A complete platform built for modern readers.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, description, color, bg }) => (
            <div key={title} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-600 transition-colors">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-4`}>
                <Icon size={20} className={color} />
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to start reading?
          </h2>
          <p className="text-slate-400 mb-8">Join today and get instant access to the full library.</p>
          <button
            onClick={() => onNavigate('register')}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-10 py-4 rounded-xl text-base transition-all hover:shadow-2xl hover:shadow-amber-500/30 hover:-translate-y-0.5"
          >
            Get Started — Free to Join
            <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
