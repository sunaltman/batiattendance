import { useEffect, useState } from "react";
import { supabase, getTodayDate, DS } from "../../lib/supabase";
import type { Scan } from "../../lib/supabase";

type FlaggedScan = Scan & { employees: { name: string } | null };

export function LateReasonsPage({ locationId }: { locationId: string }) {
  const [scans, setScans]   = useState<FlaggedScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from(DS.SCANS).select(`*, ${DS.EMPLOYEES}(name)`)
      .eq("location_id", locationId)
      .or("is_late.eq.true,missing_afternoon_in.eq.true")
      .order("scanned_at", { ascending: false })
      .limit(100)
      .then(({ data }) => { setScans((data ?? []) as FlaggedScan[]); setLoading(false); });
  }, [locationId]);

  async function dismiss(id: string) {
    // Mark as reviewed by clearing flags (but keeping record)
    await supabase.from(DS.SCANS).update({ is_late: false, missing_afternoon_in: false }).eq("id", id);
    setScans((prev) => prev.filter((s) => s.id !== id));
  }

  if (loading) return <p className="font-khmer text-muted-foreground">កំពុងផ្ទុក…</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="font-khmer text-2xl font-bold mb-6">
        មូលហេតុយឺត / ខ្វះការស្គែន ({scans.length})
      </h2>

      {scans.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-khmer text-muted-foreground">គ្មានការព្រមានដែលលោត</p>
        </div>
      )}

      <div className="space-y-4">
        {scans.map((s) => (
          <div key={s.id} className={`bg-card border rounded-2xl p-4 ${
            s.missing_afternoon_in ? "border-orange-300" : "border-amber-300"
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {s.missing_afternoon_in && (
                    <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">
                      🚨 ខ្វះ ចូល(រសៀល)
                    </span>
                  )}
                  {s.is_late && (
                    <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                      ⏰ យឺត {s.late_minutes} នាទី
                    </span>
                  )}
                </div>
                <p className="font-khmer font-semibold">{s.employees?.name ?? s.employee_id}</p>
                <p className="text-xs text-muted-foreground">
                  {s.date} · {new Date(s.scanned_at).toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" })}
                </p>

                {s.late_reason_audio_url && (
                  <div className="mt-3">
                    <p className="font-khmer text-xs text-muted-foreground mb-1">🎙 ការពន្យល់:</p>
                    <audio controls src={s.late_reason_audio_url} className="w-full h-10" />
                  </div>
                )}
                {!s.late_reason_audio_url && (
                  <p className="font-khmer text-xs text-muted-foreground mt-2 italic">មិនមានការពន្យល់ (ថ្នាក់ QR ចាស់)</p>
                )}
              </div>

              <button
                onClick={() => dismiss(s.id)}
                className="shrink-0 text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg font-khmer hover:bg-green-100 transition-colors"
              >
                ✓ ដោះស្រាយ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
