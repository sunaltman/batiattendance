import { useState, useEffect } from "react";
import { supabase, DS } from "../../lib/supabase";

type Props = {
  onSetup: (locationId: string, locationName: string) => void;
};

export function PinSetup({ onSetup }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  // true while we check if there's only one location (auto-select it, no PIN needed)
  const [autoChecking, setAutoChecking] = useState(true);

  useEffect(() => {
    supabase
      .from(DS.LOCATIONS)
      .select("id, name")
      .then(({ data }) => {
        if (data && data.length === 1) {
          localStorage.setItem("ds_location_id", data[0].id);
          localStorage.setItem("ds_location_name", data[0].name);
          onSetup(data[0].id, data[0].name);
        } else {
          setAutoChecking(false);
        }
      });
  }, []);

  async function handleDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      setLoading(true);
      const { data, error: dbErr } = await supabase
        .from(DS.LOCATIONS)
        .select("id, name")
        .eq("pin", next)
        .single();
      setLoading(false);
      if (dbErr || !data) {
        setError("PIN មិនត្រូវ — សូមព្យាយាមម្ដងទៀត");
        setShake(true);
        setTimeout(() => { setShake(false); setPin(""); }, 600);
      } else {
        localStorage.setItem("ds_location_id", data.id);
        localStorage.setItem("ds_location_name", data.name);
        onSetup(data.id, data.name);
      }
    }
  }

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"] as const;

  if (autoChecking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(145deg, #0C1B2E 0%, #152840 50%, #0E1F35 100%)" }}
      >
        <div className="w-12 h-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #0C1B2E 0%, #152840 50%, #0E1F35 100%)" }}
    >
      <div className="absolute top-1/4 -left-40 w-96 h-96 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-40 w-96 h-96 rounded-full bg-brand/4 blur-3xl pointer-events-none" />

      <div className="relative mb-8 flex items-center justify-center">
        <div className="absolute w-44 h-44 rounded-full border border-brand/12 animate-ping" style={{ animationDuration: "3.5s" }} />
        <div className="absolute w-40 h-40 rounded-full border border-brand/8 animate-ping" style={{ animationDuration: "2.8s", animationDelay: "0.8s" }} />
        <div className="relative w-32 h-32 rounded-full border-2 border-brand/40 p-1.5 bg-ds-dark/60 backdrop-blur-sm animate-glow-pulse">
          <img src="/logo.png" alt="Den Samot" className="w-full h-full rounded-full object-cover" />
        </div>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-white text-2xl font-bold tracking-widest uppercase" style={{ fontFamily: "Georgia, serif" }}>
          Den Samot
        </h1>
        <p className="font-khmer text-brand-light/70 text-sm mt-1">ប្រព័ន្ធគ្រប់គ្រងវត្តមាន</p>
      </div>

      <div
        className={`w-80 rounded-3xl p-8 shadow-2xl ${shake ? "animate-shake" : ""}`}
        style={{
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <p className="font-khmer text-brand-light/70 text-center text-sm mb-6">PIN ទីតាំង</p>

        <div className="flex gap-5 justify-center mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="relative w-5 h-5 flex items-center justify-center">
              <div className={`rounded-full border-2 transition-all duration-200 ${
                pin.length > i
                  ? "w-5 h-5 bg-brand border-brand shadow-lg"
                  : "w-4 h-4 border-white/30 bg-transparent"
              }`}
                style={pin.length > i ? { boxShadow: "0 0 8px rgba(75,108,183,0.5)" } : {}}
              />
            </div>
          ))}
        </div>

        {error && <p className="font-khmer text-ds-red text-center text-xs mb-4">{error}</p>}

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <p className="font-khmer text-brand-light/50 text-sm">កំពុងពិនិត្យ…</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {digits.map((d, i) => (
              <button
                key={i}
                disabled={d === ""}
                onClick={() => {
                  if (d === "⌫") { setPin((p) => p.slice(0, -1)); setError(""); }
                  else if (d !== "") handleDigit(d);
                }}
                className={`h-14 rounded-2xl text-xl font-semibold transition-all duration-100 active:scale-90 ${
                  d === "" ? "invisible" :
                  d === "⌫"
                    ? "text-white/40 hover:text-white/70"
                    : "text-white hover:bg-brand/30 active:bg-brand active:shadow-lg"
                }`}
                style={d !== "" && d !== "⌫" ? {
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                } : {}}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
