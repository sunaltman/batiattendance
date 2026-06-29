import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export function LoginPage({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err || !data.session) { setError(err?.message ?? "Login failed"); return; }
    onLogin(data.session);
  }

  return (
    <div className="min-h-screen bg-ds-dark flex items-center justify-center px-6">
      <div className="bg-white/5 border border-white/10 rounded-3xl p-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🦐</div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "Georgia, serif" }}>Den Samot Admin</h1>
          <p className="font-khmer text-brand-light mt-1 text-sm">ចូលគ្រប់គ្រង</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="អ៊ីមែល" required
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-brand"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="ពាក្យសម្ងាត់" required
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-brand"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="bg-brand hover:bg-brand-dark text-white font-khmer font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? "…" : "ចូល"}
          </button>
        </form>
      </div>
    </div>
  );
}
