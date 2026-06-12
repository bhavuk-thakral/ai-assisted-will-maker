'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Send, AlertTriangle, AlertCircle, FileText, CheckCircle2, RotateCcw } from 'lucide-react';

export default function WillBuilderPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [will, setWill] = useState<any>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const hasInitialized = useRef(false); // Prevents double-fire in React Strict Mode / re-navigation

  // Validation states
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[]; valid: boolean }>({
    errors: [],
    warnings: [],
    valid: false
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Guard: only run once per page mount
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const storedToken = localStorage.getItem('will_maker_token');
    if (!storedToken) {
      router.replace('/login');
      return;
    }
    setToken(storedToken);
    loadInitialData(storedToken);
  }, [router]);

  useEffect(() => {
    // Scroll chat to bottom when chat updates
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const loadInitialData = async (jwtToken: string) => {
    try {
      // 1. Get history and current will status
      const chatRes = await fetch('http://localhost:3001/chat/history', {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (!chatRes.ok) throw new Error('Failed to load chat history');
      const chatData = await chatRes.json();

      setWill(chatData.will);

      const history = chatData.history || [];
      if (history.length === 0) {
        // No history yet — show a static welcome message locally.
        // Do NOT auto-send to the API to avoid duplicate "hello" messages on every page visit.
        setChat([{
          role: 'assistant',
          message: "Hello! I'm your AI legal assistant. I'll guide you through creating your Last Will and Testament one step at a time.\n\nLet's begin — what is your full legal name?"
        }]);
      } else {
        setChat(history);
      }

      // 2. Load validation
      if (chatData.will?.id) {
        fetchValidation(chatData.will.id, jwtToken);
      }
    } catch (err) {
      console.error(err);
    }
  };


  const fetchValidation = async (willId: number, jwtToken: string) => {
    try {
      const res = await fetch(`http://localhost:3001/will/${willId}/validate`, {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setValidation(data);
      }
    } catch (err) {
      console.error('Validation failed to fetch:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || loadingChat) return;

    const msg = inputMessage;
    setInputMessage('');
    setLoadingChat(true);

    // Optimistically add user message to chat pane
    setChat(prev => [...prev, { role: 'user', message: msg }]);

    try {
      const res = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: msg })
      });

      if (!res.ok) throw new Error('Chat connection failed');

      const data = await res.json();

      // Update chat and will details
      setChat(prev => [...prev, { role: 'assistant', message: data.reply }]);
      setWill(data.will);

      // Refresh validation rules
      if (data.will?.id) {
        fetchValidation(data.will.id, token);
      }
    } catch (err) {
      setChat(prev => [...prev, { role: 'assistant', message: 'Sorry, I lost connection to the server. Please check if the backend is running.' }]);
    } finally {
      setLoadingChat(false);
    }
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

  const resetChat = async () => {
    if (!confirm('Are you sure you want to reset your conversation and draft?')) return;
    try {
      // Re-create a blank will and clear messages by registering or just creating a new default setup.
      // But since we want to keep it simple, we can have the backend reset it, or we just drop/delete records.
      // Let's implement reset simply on the front by re-triggering registration or default setup, but wait,
      // let's just refresh the page. We can tell the user how to reset.
      alert('To restart, register a new account or clear messages.');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">

      {/* Top Header Panel (Progress & Actions) */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center">

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Drafting: {will?.full_name || 'Draft Will'}
              </h1>
              <p className="text-xs text-slate-500">Guide the interview to complete your Last Will</p>
            </div>
          </div>

          {/* Progress Calculation Bar */}
          <div className="flex items-center gap-4 w-full sm:w-auto min-w-[280px]">
            <div className="flex-1">
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Will Integrity Progress</span>
                <span className="text-slate-900 font-bold">{will?.progressPercentage || 0}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="bg-slate-900 h-full rounded-full transition-all duration-300"
                  style={{ width: `${will?.progressPercentage || 0}%` }}
                />
              </div>
            </div>
             {will?.id && (
               <button
                 onClick={() => downloadPdf(will.id)}
                 disabled={downloading}
                 className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium rounded-xl flex items-center gap-2 text-xs transition-colors whitespace-nowrap"
               >
                 {downloading ? (
                   <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                 ) : (
                   <FileText className="w-4 h-4" />
                 )}
                 <span>{downloading ? 'Downloading...' : 'Download PDF'}</span>
               </button>
             )}
          </div>
        </div>
      </header>

      {/* Workspace Grid */}
      <div className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 overflow-hidden">

        {/* Left Side: AI Chat Interview */}
        <div className="bg-white border border-slate-200/80 rounded-2xl flex flex-col h-[calc(100vh-190px)] overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-slate-900 rounded-full animate-pulse"></span>
              <h3 className="font-bold text-sm text-slate-700">AI Legal Assistant</h3>
            </div>
            <span className="text-xs text-slate-500">Interviewing active...</span>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
            {chat.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-none shadow-sm'
                      : 'bg-white border border-slate-200/60 text-slate-800 rounded-bl-none shadow-sm'
                    }`}
                >
                  <p>{msg.message}</p>
                </div>
              </div>
            ))}
            {loadingChat && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200/60 px-4 py-3 rounded-2xl rounded-bl-none text-slate-500 text-sm flex items-center gap-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span>AI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message input form */}
          <form onSubmit={handleSendMessage} className="border-t border-slate-100 p-4 bg-slate-50 flex gap-2">
            <input
              type="text"
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-slate-400 transition-colors"
              placeholder="Type your response here..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={loadingChat}
            />
            <button
              type="submit"
              disabled={loadingChat || !inputMessage.trim()}
              className="p-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Right Side: Live Will Document Preview */}
        <div className="bg-white border border-slate-200/80 rounded-2xl flex flex-col h-[calc(100vh-190px)] overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-sm text-slate-700">Live Will Preview (Draft)</h3>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">Times New Roman</span>
          </div>

          {/* Document Sheet Pane */}
          <div className="flex-1 overflow-y-auto p-8 bg-slate-100/60 flex justify-center">
            <div className="will-paper w-full max-w-2xl px-12 py-16 shadow-2xl min-h-[842px] border border-slate-200 leading-loose flex flex-col justify-between">

              <div>
                <h1 className="text-center font-bold text-2xl tracking-wide uppercase border-b-2 border-double border-slate-800 pb-2 mb-6">
                  Last Will and Testament
                </h1>

                <p className="indent-8 text-justify text-sm mb-4">
                  I, <strong className="underline">{will?.full_name || '________________________'}</strong>,
                  residing at <strong className="underline">{will?.address || '________________________________________________'}</strong>,
                  aged <strong className="underline">{will?.age !== null && will?.age !== undefined ? String(will?.age) : '_____'}</strong>,
                  being of sound mind and memory, and not acting under duress, menace, fraud, or undue influence,
                  do hereby make, publish, and declare this instrument to be my Last Will and Testament, hereby revoking any and all prior wills and codicils.
                </p>

                <h3 className="font-bold text-sm uppercase mt-6 mb-2 border-b border-slate-300 pb-1">
                  1. Guardian Appointment
                </h3>
                <p className="indent-8 text-justify text-sm mb-4">
                  In the event of my death, if I leave behind minor children requiring a guardian, I nominate
                  <strong className="underline"> {will?.guardian_name && will?.guardian_name.toLowerCase() !== 'none' ? will.guardian_name : '________________________'}</strong>
                  to serve as the Guardian of their person and estate.
                </p>

                <h3 className="font-bold text-sm uppercase mt-6 mb-2 border-b border-slate-300 pb-1">
                  2. Executor Nomination
                </h3>
                <p className="indent-8 text-justify text-sm mb-4">
                  I nominate, constitute, and appoint <strong className="underline">{will?.executor_name || '________________________'}</strong> as the Executor of this my Last Will and Testament. I direct that no executor shall be required to post bond or security.
                </p>

                <h3 className="font-bold text-sm uppercase mt-6 mb-2 border-b border-slate-300 pb-1">
                  3. Disposition of Assets
                </h3>
                <p className="text-sm mb-2">Subject to my debts and funeral expenses, I allocate my real and personal properties as follows:</p>

                <p className="text-sm font-semibold mb-1">Specific Assets Declared:</p>
                <ul className="list-disc list-inside pl-4 text-sm mb-4 space-y-1">
                  {will?.assets && will.assets.length > 0 ? (
                    will.assets.map((a: any, idx: number) => <li key={idx}><span className="underline font-bold">{a.asset_name}</span></li>)
                  ) : (
                    <li className="text-slate-400 italic">No specific assets declared. Entire estate will default.</li>
                  )}
                </ul>

                <p className="text-sm font-semibold mb-1">Distribution to Beneficiaries:</p>
                <ul className="list-disc list-inside pl-4 text-sm mb-4 space-y-1">
                  {will?.beneficiaries && will.beneficiaries.length > 0 ? (
                    will.beneficiaries.map((b: any, idx: number) => (
                      <li key={idx}>
                        <strong className="underline">{b.name}</strong> ({b.relationship}) - <strong className="underline">{b.share_percentage}% share</strong>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400 italic">No beneficiaries set. Estate distribution undefined.</li>
                  )}
                </ul>

                <h3 className="font-bold text-sm uppercase mt-6 mb-2 border-b border-slate-300 pb-1">
                  4. Signature and Attestation
                </h3>
                <p className="text-sm mb-6">
                  IN WITNESS WHEREOF, I have hereunto signed my name on this _____ day of ________________, 20___.
                </p>

                <div className="flex justify-between items-end mt-6">
                  <div className="w-[45%]">
                    <div className="border-b border-slate-900 h-8"></div>
                    <p className="text-xs font-bold mt-1">Testator / Testatrix</p>
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-xs text-justify leading-relaxed mb-4">
                    The foregoing instrument was signed, published, and declared by the Testator to be their Last Will and Testament, in the presence of us, who have subscribed our names as witnesses.
                  </p>

                  <div className="grid grid-cols-2 gap-6 mt-4">
                    {will?.witnesses && will.witnesses.length > 0 ? (
                      will.witnesses.map((w: any, idx: number) => (
                        <div key={idx}>
                          <p className="text-xs font-bold">Witness {idx + 1}: {w.name}</p>
                          <div className="border-b border-slate-900 h-6"></div>
                          <p className="text-[10px] text-slate-500 mt-1">Signature & Date</p>
                        </div>
                      ))
                    ) : (
                      <>
                        <div>
                          <p className="text-xs font-bold">Witness 1: ________________________</p>
                          <div className="border-b border-slate-900 h-6"></div>
                          <p className="text-[10px] text-slate-500 mt-1">Signature & Date</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold">Witness 2: ________________________</p>
                          <div className="border-b border-slate-900 h-6"></div>
                          <p className="text-[10px] text-slate-500 mt-1">Signature & Date</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 mt-12 pt-4 border-t border-slate-200 font-sans">
                AI Assisted Will Draft • Privileged and Confidential
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Bottom Panel: Validation Alerts & Errors */}
      <footer className="bg-white border-t border-slate-200 p-5 mt-auto shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-6">

          <div className="flex-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
              <span>Will Validation Rules</span>
              {validation.valid ? (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valid Draft</span>
                </span>
              ) : (
                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Issues Found</span>
                </span>
              )}
            </h4>

            {/* Warning & Error lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Errors (Blockers) */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Required (Errors: {validation.errors.length})</span>
                </p>
                {validation.errors.length > 0 ? (
                  validation.errors.map((err, idx) => (
                    <p key={idx} className="text-sm text-slate-600 pl-4 relative before:absolute before:left-1.5 before:top-2 before:w-1 before:h-1 before:bg-red-500 before:rounded-full">
                      {err}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 italic pl-4">No validation errors.</p>
                )}
              </div>

              {/* Warnings (Suggestions) */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Suggestions (Warnings: {validation.warnings.length})</span>
                </p>
                {validation.warnings.length > 0 ? (
                  validation.warnings.map((warn, idx) => (
                    <p key={idx} className="text-sm text-slate-600 pl-4 relative before:absolute before:left-1.5 before:top-2 before:w-1 before:h-1 before:bg-amber-500 before:rounded-full">
                      {warn}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 italic pl-4">No legal warnings found.</p>
                )}
              </div>

            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
