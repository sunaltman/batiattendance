import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ImportData = {
  attendance_logs: {
    employee_id: string;
    date: string;
    shift: "morning" | "afternoon";
    checked_in_at: string;
    checked_out_at: string | null;
    verified: boolean;
  }[];
  leave_records: {
    employee_id: string;
    date: string;
    type: "full" | "half";
  }[];
};

type Phase = "idle" | "checking" | "ready" | "running" | "done" | "error";

const BATCH = 200;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ImportPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<ImportData | null>(null);
  const [existing, setExisting] = useState<{ attendance: number; leave: number } | null>(null);
  const [progress, setProgress] = useState({ attendance: 0, leave: 0, errors: 0 });
  const [statusMsg, setStatusMsg] = useState("");

  // Load the JSON file and check existing counts
  useEffect(() => {
    setPhase("checking");
    Promise.all([
      fetch(import.meta.env.BASE_URL + "import-data.json").then((r) => r.json()),
      supabase.from("attendance_logs").select("*", { count: "exact", head: true }),
      supabase.from("leave_records").select("*", { count: "exact", head: true }),
    ])
      .then(([json, attRes, leaveRes]) => {
        setData(json as ImportData);
        setExisting({ attendance: attRes.count ?? 0, leave: leaveRes.count ?? 0 });
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  }, []);

  async function runImport() {
    if (!data) return;
    setPhase("running");
    setProgress({ attendance: 0, leave: 0, errors: 0 });
    let errors = 0;

    // ── Attendance logs ──
    setStatusMsg("កំពុង import វត្តមាន...");
    const attBatches = chunkArray(data.attendance_logs, BATCH);
    for (let i = 0; i < attBatches.length; i++) {
      const { error } = await supabase
        .from("attendance_logs")
        .upsert(attBatches[i], { onConflict: "employee_id,date,shift", ignoreDuplicates: true });
      if (error) errors++;
      setProgress((p) => ({ ...p, attendance: Math.min(data.attendance_logs.length, (i + 1) * BATCH), errors: p.errors + (error ? 1 : 0) }));
    }

    // ── Leave records ──
    setStatusMsg("កំពុង import ច្បាប់...");
    const leaveBatches = chunkArray(data.leave_records, BATCH);
    for (let i = 0; i < leaveBatches.length; i++) {
      const { error } = await supabase
        .from("leave_records")
        .upsert(leaveBatches[i], { onConflict: "employee_id,date", ignoreDuplicates: true });
      if (error) errors++;
      setProgress((p) => ({ ...p, leave: Math.min(data.leave_records.length, (i + 1) * BATCH), errors: p.errors + (error ? 1 : 0) }));
    }

    setStatusMsg(errors > 0 ? `រួចរាល់ (${errors} batch errors)` : "Import ជោគជ័យ!");
    setPhase("done");

    // Refresh counts
    const [attRes, leaveRes] = await Promise.all([
      supabase.from("attendance_logs").select("*", { count: "exact", head: true }),
      supabase.from("leave_records").select("*", { count: "exact", head: true }),
    ]);
    setExisting({ attendance: attRes.count ?? 0, leave: leaveRes.count ?? 0 });
  }

  const attPct = data ? Math.round((progress.attendance / data.attendance_logs.length) * 100) : 0;
  const leavePct = data ? Math.round((progress.leave / data.leave_records.length) * 100) : 0;
  const isRunning = phase === "running";
  const alreadyImported = existing && existing.attendance > 500;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold font-khmer text-gray-900 mb-1">Import ទិន្នន័យ Excel</h1>
        <p className="text-sm text-gray-500 mb-6">
          ទិន្នន័យ ១៥ ខែ (មីនា ២០២៥ – ឧសភា ២០២៦) ពីសំណួរ Excel
        </p>

        {/* Source summary */}
        {data && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-3">ទិន្នន័យក្នុងឯកសារ</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{data.attendance_logs.length.toLocaleString()}</div>
                <div className="text-xs text-blue-600 font-khmer">កំណត់ត្រាវត្តមាន</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{data.leave_records.length}</div>
                <div className="text-xs text-green-600 font-khmer">កំណត់ត្រាច្បាប់</div>
              </div>
            </div>
          </div>
        )}

        {/* Current DB state */}
        {existing && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-3">ទិន្នន័យក្នុង Supabase បច្ចុប្បន្ន</div>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg p-3 text-center ${alreadyImported ? "bg-yellow-50" : "bg-gray-50"}`}>
                <div className={`text-2xl font-bold ${alreadyImported ? "text-yellow-700" : "text-gray-700"}`}>
                  {existing.attendance.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 font-khmer">វត្តមាន rows</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-700">{existing.leave}</div>
                <div className="text-xs text-gray-500 font-khmer">ច្បាប់ rows</div>
              </div>
            </div>
            {alreadyImported && (
              <div className="mt-3 text-xs font-khmer text-yellow-700 bg-yellow-50 rounded-lg p-2">
                ⚠ ហាក់ដូចជាបាន import រួចហើយ — ចុចម្ដងទៀតនឹងរំលងដោយស្វ័យប្រវត្តិ (upsert)
              </div>
            )}
          </div>
        )}

        {/* Progress (running or done) */}
        {(isRunning || phase === "done") && data && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm space-y-3">
            <div className="text-sm font-semibold text-gray-700">{statusMsg}</div>

            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>វត្តមាន</span>
                <span>{progress.attendance.toLocaleString()} / {data.attendance_logs.length.toLocaleString()}</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${attPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>ច្បាប់</span>
                <span>{progress.leave} / {data.leave_records.length}</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${leavePct}%` }} />
              </div>
            </div>

            {progress.errors > 0 && (
              <div className="text-xs text-red-600">Batch errors: {progress.errors}</div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {phase === "checking" && (
            <div className="text-center py-8 text-gray-400 font-khmer">កំពុងផ្ទុក...</div>
          )}

          {phase === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 font-khmer text-sm">
              មានបញ្ហាក្នុងការផ្ទុក import-data.json
            </div>
          )}

          {(phase === "ready" || phase === "done") && (
            <button
              onClick={runImport}
              disabled={isRunning}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold font-khmer rounded-xl text-lg min-h-[56px] transition-colors"
            >
              {phase === "done" ? "Import ម្ដងទៀត" : alreadyImported ? "Import (upsert)" : "ចាប់ផ្ដើម Import"}
            </button>
          )}

          {isRunning && (
            <div className="w-full py-4 bg-gray-200 text-gray-500 font-khmer rounded-xl text-center text-lg">
              <span className="animate-pulse">កំពុង import...</span>
            </div>
          )}

          {phase === "done" && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-green-700 font-bold font-khmer text-lg flex items-center gap-2"><CheckCircle size={18} /> {statusMsg}</div>
              <div className="text-sm text-green-600 mt-1">
                {existing?.attendance.toLocaleString()} វត្តមាន · {existing?.leave} ច្បាប់
              </div>
              <a href="/dashboard" className="mt-3 inline-block text-blue-600 underline font-khmer text-sm">
                ទៅ Dashboard
              </a>
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-gray-400 font-khmer">
          Import ប្រើ upsert — មិនបង្កើតទិន្នន័យស្ទួនទេ។ អាចចុចម្ដងទៀតបានដោយស្រួល។
        </div>
      </div>
    </div>
  );
}
