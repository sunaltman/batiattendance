import { useEffect, useState } from "react";
import { supabase, getTodayDate, DS } from "../../lib/supabase";
import type { Scan } from "../../lib/supabase";
import { SCAN_TYPE_LABEL_KH } from "../../lib/scan-logic";

type ScanWithName = Scan & { employees: { name: string } | null };

export function Dashboard({ locationId }: { locationId: string }) {
  const [scans, setScans]       = useState<ScanWithName[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const today = getTodayDate();
      const [{ data: sc }, { data: emps }] = await Promise.all([
        supabase.from(DS.SCANS).select(`*, ${DS.EMPLOYEES}(name)`).eq("location_id", locationId).eq("date", today),
        supabase.from(DS.EMPLOYEES).select("id, name").eq("location_id", locationId).eq("is_active", true),
      ]);
      setScans((sc ?? []) as ScanWithName[]);
      setEmployees(emps ?? []);
      setLoading(false);
    }
    load();
  }, [locationId]);

  const scanTypes = ["morning_in", "morning_out", "afternoon_in", "afternoon_out"] as const;
  const absentToday = employees.filter((e) => !scans.some((s) => s.employee_id === e.id));
  const lateScans   = scans.filter((s) => s.is_late || s.missing_afternoon_in);

  const counts = scanTypes.map((t) => ({
    type: t,
    count: scans.filter((s) => s.scan_type === t).length,
  }));

  if (loading) return <p className="font-khmer text-muted-foreground">កំពុងផ្ទុក…</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="font-khmer text-2xl font-bold">ថ្ងៃនេះ — {getTodayDate()}</h2>

      {/* Scan counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {counts.map(({ type, count }) => (
          <div key={type} className="bg-card border rounded-2xl p-4 text-center">
            <p className="text-3xl font-bold text-brand-dark">{count}</p>
            <p className="font-khmer text-sm text-muted-foreground mt-1">{SCAN_TYPE_LABEL_KH[type]}</p>
          </div>
        ))}
      </div>

      {/* Flags */}
      {lateScans.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="font-khmer font-semibold text-amber-800 mb-3">⚠️ ការព្រមាន ({lateScans.length})</h3>
          <ul className="space-y-1">
            {lateScans.map((s) => (
              <li key={s.id} className="font-khmer text-sm text-amber-700 flex gap-2">
                <span className="font-semibold">{s.employees?.name ?? s.employee_id}</span>
                {s.is_late && <span>— មកយឺត {s.late_minutes} នាទី ({SCAN_TYPE_LABEL_KH[s.scan_type]})</span>}
                {s.missing_afternoon_in && <span>— ខ្វះ ចូល(រសៀល)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Absent */}
      {absentToday.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h3 className="font-khmer font-semibold text-red-800 mb-3">❌ អវត្តមាន ({absentToday.length})</h3>
          <ul className="space-y-1">
            {absentToday.map((e) => (
              <li key={e.id} className="font-khmer text-sm text-red-700">• {e.name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Scan grid */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="font-khmer text-left px-4 py-2">ឈ្មោះ</th>
              {scanTypes.map((t) => (
                <th key={t} className="font-khmer text-center px-3 py-2">{SCAN_TYPE_LABEL_KH[t]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="font-khmer px-4 py-2 font-medium">{e.name}</td>
                {scanTypes.map((t) => {
                  const key = e.id + "_" + t;
                  const s = scans.find((sc) => sc.employee_id === e.id && sc.scan_type === t);
                  return (
                    <td key={t} className="text-center px-3 py-2">
                      {s ? (
                        <span className={`inline-block text-xs rounded-full px-2 py-0.5 ${
                          s.is_late ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                        }`}>
                          {new Date(s.scanned_at).toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
