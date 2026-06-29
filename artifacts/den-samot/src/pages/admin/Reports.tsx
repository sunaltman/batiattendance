import { useEffect, useState } from "react";
import { supabase, getTodayDate, DS } from "../../lib/supabase";
import type { Scan } from "../../lib/supabase";
import { SCAN_TYPE_LABEL_KH } from "../../lib/scan-logic";

type ScanRow = Scan & { employees: { name: string } | null };

export function ReportsPage({ locationId }: { locationId: string }) {
  const [from, setFrom] = useState(getTodayDate());
  const [to, setTo]     = useState(getTodayDate());
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from(DS.SCANS).select(`*, ${DS.EMPLOYEES}(name)`)
      .eq("location_id", locationId)
      .gte("date", from).lte("date", to)
      .order("scanned_at", { ascending: false });
    setScans((data ?? []) as ScanRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [locationId]);

  function exportCSV() {
    const headers = ["ឈ្មោះ","ID","ថ្ងៃ","ប្រភេទ","ម៉ោង","យឺត","ចំនួននាទី","ហេតុផល Audio"];
    const rows = scans.map((s) => [
      s.employees?.name ?? s.employee_id,
      s.employee_id,
      s.date,
      SCAN_TYPE_LABEL_KH[s.scan_type],
      new Date(s.scanned_at).toLocaleTimeString("km-KH"),
      s.is_late ? "✓" : "",
      s.late_minutes ?? "",
      s.late_reason_audio_url ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `densamot_${from}_${to}.csv`;
    a.click();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="font-khmer text-sm text-muted-foreground block mb-1">ពី</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="font-khmer text-sm text-muted-foreground block mb-1">ដល់</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border rounded-xl px-3 py-2 text-sm" />
        </div>
        <button onClick={load}
          className="bg-brand text-white px-4 py-2 rounded-xl font-khmer text-sm hover:bg-brand-dark transition-colors">
          ស្វែងរក
        </button>
        <button onClick={exportCSV}
          className="bg-muted px-4 py-2 rounded-xl font-khmer text-sm hover:bg-muted/80 transition-colors ml-auto">
          ⬇ CSV
        </button>
      </div>

      {loading ? (
        <p className="font-khmer text-muted-foreground">កំពុងផ្ទុក…</p>
      ) : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {["ឈ្មោះ","ថ្ងៃ","ប្រភេទ","ម៉ោង","​ស្ថានភាព"].map((h) => (
                  <th key={h} className="font-khmer text-left px-4 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 && (
                <tr><td colSpan={5} className="font-khmer text-center py-8 text-muted-foreground">គ្មានទិន្នន័យ</td></tr>
              )}
              {scans.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="font-khmer px-4 py-2 font-medium">{s.employees?.name ?? s.employee_id}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.date}</td>
                  <td className="font-khmer px-4 py-2">{SCAN_TYPE_LABEL_KH[s.scan_type]}</td>
                  <td className="px-4 py-2">
                    {new Date(s.scanned_at).toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2">
                    {s.missing_afternoon_in && <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 mr-1">ខ្វះ🕑</span>}
                    {s.is_late && <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">យឺត {s.late_minutes}ន</span>}
                    {!s.is_late && !s.missing_afternoon_in && <span className="text-xs text-green-600">✓</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
