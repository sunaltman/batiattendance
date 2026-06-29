import { useState } from "react";
import { supabase, DS } from "../../lib/supabase";

type Props = {
  onSetup: (locationId: string, locationName: string) => void;
};

export function PinSetup({ onSetup }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        setPin("");
      } else {
        localStorage.setItem("ds_location_id", data.id);
        localStorage.setItem("ds_location_name", data.name);
        onSetup(data.id, data.name);
      }
    }
  }

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"] as const;

  return (
    <div className="min-h-screen bg-ds-dark flex flex-col items-center justify-center px-8">
      <div className="mb-10 text-center">
        <div className="text-5xl mb-4">🦐</div>
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "Georgia, serif" }}>
          Den Samot
        </h1>
        <p className="font-khmer text-brand-light text-lg">បញ្ចូល PIN ទីតាំង</p>
      </div>

      {/* PIN display */}
      <div className="flex gap-4 mb-8">
        {[0,1,2,3].map((i) => (
          <div key={i}
            className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl transition-all ${
              pin.length > i ? "bg-brand border-brand text-white" : "bg-white/10 border-white/30 text-transparent"
            }`}
          >
            ●
          </div>
        ))}
      </div>

      {error && (
        <p className="font-khmer text-red-400 text-center mb-6 text-sm">{error}</p>
      )}

      {/* Numpad */}
      {loading ? (
        <div className="text-white font-khmer text-xl animate-pulse">កំពុងពិនិត្យ…</div>
      ) : (
        <div className="grid grid-cols-3 gap-3 w-64">
          {digits.map((d, i) => (
            <button
              key={i}
              disabled={d === ""}
              onClick={() => {
                if (d === "⌫") { setPin((p) => p.slice(0, -1)); setError(""); }
                else if (d !== "") handleDigit(d);
              }}
              className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
                d === "" ? "invisible" :
                d === "⌫" ? "bg-white/10 text-white/60 hover:bg-white/20" :
                "bg-white/15 text-white hover:bg-brand active:bg-brand-dark"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
