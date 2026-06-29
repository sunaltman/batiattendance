import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export function LoginPage({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err || !data.session) { setError(err?.message ?? "Login failed"); return; }
    onLogin(data.session);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #0C1B2E 0%, #152840 50%, #0E1F35 100%)" }}
    >
      {/* Ambient orbs */}
      <div className="absolute top-1/3 -left-40 w-80 h-80 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 -right-40 w-80 h-80 rounded-full bg-brand/4 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo header */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-4">
            <div className="absolute w-28 h-28 rounded-full bg-brand/8 animate-ping" style={{ animationDuration: "3s" }} />
            <div
              className="relative w-20 h-20 rounded-full border-2 border-brand/40 p-1 animate-glow-pulse"
              style={{ background: "rgba(12,27,46,0.7)", backdropFilter: "blur(8px)" }}
            >
              <img src="/logo.png" alt="Den Samot" className="w-full h-full rounded-full object-cover" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: "Georgia, serif" }}>
            Den Samot
          </h1>
          <p className="font-khmer text-brand-light/50 text-sm mt-1">ចូលគ្រប់គ្រង</p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl p-8 shadow-2xl"
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-khmer text-white/50 text-xs pl-1">អ៊ីមែល</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" required
                className="rounded-xl px-4 py-3 text-white placeholder-white/20 outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(75,108,183,0.5)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-khmer text-white/50 text-xs pl-1">ពាក្យសម្ងាត់</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="rounded-xl px-4 py-3 text-white placeholder-white/20 outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(75,108,183,0.5)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)")}
              />
            </div>

            {error && (
              <p className="text-ds-red text-sm text-center font-khmer bg-ds-red/10 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit" disabled={loading}
              className="mt-2 py-3.5 rounded-xl font-khmer font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #4B6CB7, #2E4F8A)",
                boxShadow: "0 4px 16px rgba(75,108,183,0.35)",
              }}
            >
              {loading ? "…" : "ចូល"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
