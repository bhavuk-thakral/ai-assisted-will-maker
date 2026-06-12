'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, LogOut, ArrowRight, ShieldCheck, User, MapPin, ClipboardList, Eye } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [will, setWill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('will_maker_token');
    const storedUser = localStorage.getItem('will_maker_user');

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    setUser(JSON.parse(storedUser));
    fetchWillData(token);
  }, [router]);

  const fetchWillData = async (token: string) => {
    try {
      const res = await fetch('http://localhost:3001/will/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('will_maker_token');
          router.replace('/login');
          return;
        }
        throw new Error('Failed to load your Will data');
      }

      const data = await res.json();
      setWill(data);
    } catch (err: any) {
      setError(err.message || 'Connection to server failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('will_maker_token');
    localStorage.removeItem('will_maker_user');
    router.replace('/login');
  };

  const downloadPdf = async (willId: number) => {
    setDownloading(true);
    try {
      const res = await fetch(`http://localhost:3001/will/${willId}/document`);
      if (!res.ok) throw new Error('Failed to fetch document HTML');
      const htmlText = await res.text();

      // Create a temporary container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlText;
      
      // Remove the "no-print" banner
      const banner = tempDiv.querySelector('.no-print');
      if (banner) banner.remove();

      // Inject styling adjustments for A4 container size so that formatting remains exactly as legal paper
      const styleTag = document.createElement('style');
      styleTag.innerHTML = `
        body { background: white !important; color: black !important; }
        .will-paper { box-shadow: none !important; border: none !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; }
      `;
      tempDiv.appendChild(styleTag);

      // Load html2pdf dynamically from CDN if it doesn't exist
      // @ts-ignore
      if (!window.html2pdf) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load html2pdf bundle'));
          document.head.appendChild(script);
        });
      }

      // @ts-ignore
      const html2pdf = window.html2pdf;
      const opt = {
        margin:       [15, 15, 15, 15],
        filename:     `Last_Will_and_Testament_${will?.full_name || 'Draft'}.pdf`.replace(/\s+/g, '_'),
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(tempDiv).save();
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Navbar */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-slate-900" />
            <span className="font-bold text-lg tracking-wide text-slate-900">WillMaker AI</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="text-slate-500 hover:text-slate-900 text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium text-sm">
            {error}
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Your Estate Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage and draft your Last Will and Testament legally and securely.</p>
        </div>

        {/* Dashboard Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Will progress card */}
          <div className="md:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Last Will & Testament Draft</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Status: <span className="text-slate-900 font-semibold">{will?.status || 'IN_PROGRESS'}</span></p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
                  AI Interview
                </span>
              </div>

              {/* Progress bar */}
              <div className="my-6">
                <div className="flex justify-between text-sm font-semibold mb-2">
                  <span className="text-slate-700">Completion Progress</span>
                  <span className="text-slate-900 font-bold">{will?.progressPercentage || 0}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className="bg-slate-900 h-full rounded-full transition-all duration-500"
                    style={{ width: `${will?.progressPercentage || 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Link
                href="/will-builder"
                className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <span>{will?.progressPercentage > 0 ? 'Resume Will Builder' : 'Start Will Builder'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              {will?.id && (
                <button
                  onClick={() => downloadPdf(will.id)}
                  disabled={downloading}
                  className="py-3 px-4 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  {downloading ? (
                    <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  <span>{downloading ? 'Downloading PDF...' : 'Download PDF'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Summary Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <h3 className="text-md font-bold text-slate-900 mb-4">Will Checklist</h3>
            <div className="space-y-3 flex-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.full_name ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>Full Name</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.age ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>Age</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.address ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>Address</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.executor_name ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>Executor nominated</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.assets?.length > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>Assets specified ({will?.assets?.length || 0})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.beneficiaries?.length > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>Beneficiaries set ({will?.beneficiaries?.length || 0})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${will?.witnesses?.length >= 2 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                <span>2 Witnesses named ({will?.witnesses?.length || 0}/2)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Tips */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500 flex gap-4 shadow-sm">
          <ClipboardList className="w-5 h-5 text-slate-700 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-slate-900">How it works</h4>
            <p className="mt-1 leading-relaxed text-slate-500">
              Click the **Start Will Builder** button to open the workspace. Chat with our AI attorney assistant to fill out your details step-by-step. The live legal document preview on the right will update in real-time as the AI extracts your info. You can validate the rules and save/print your document at any time.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
