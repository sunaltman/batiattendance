import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import { calcLeaveEntitlement, calcTenureYears } from "@/lib/utils";
import type { LeaveRecord } from "@/lib/supabase";

type LeaveEntry = {
  employee_id: string;
  name: string;
  department: string;
  entitlement: number;
  used: number;
  remaining: number;
  records: LeaveRecord[];
};

type FormState = {
  open: boolean;
  employee_id: string;
  name: string;
  date: string;
  type: "full" | "half";
  submitting: boolean;
  error: string;
};

const YEAR = new Date().getFullYear();

export default function LeavePage() {
  const [entries, setEntries] = useState<LeaveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("all");
  const [form, setForm] = useState<FormState>({
    open: false, employee_id: "", name: "", date: new Date().toISOString().split("T")[0],
    type: "full", submitting: false, error: "",
  });

  const load = useCallback(async () => {
    const { data: records } = await supabase
      .from("leave_records")
      .select("*")
      .gte("date", `${YEAR}-01-01`)
      .lte("date", `${YEAR}-12-31`)
      .order("date", { ascending: false });

    const allRecords: LeaveRecord[] = records ?? [];

    const data: LeaveEntry[] = EMPLOYEES.map((emp) => {
      const empRecords = allRecords.filter((r) => r.employee_id === emp.id);
      const used = empRecords.reduce((s, r) => s + (r.type === "full" ? 1 : 0.5), 0);
      const entitlement = calcLeaveEntitlement(emp.start_date);
      return {
        employee_id: emp.id,
        name: emp.name,
        department: emp.department,
        entitlement,
        used,
        remaining: entitlement - used,
        records: empRecords,
      };
    });

    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openForm(emp: LeaveEntry) {
    setForm(f => ({ ...f, open: true, employee_id: emp.employee_id, name: emp.name, error: "" }));
  }

  async function submitLeave() {
    if (!form.date) { setForm(f => ({ ...f, error: "សូមជ្រើសរើសថ្ងៃ" })); return; }

    // Check if already has leave on this date
    const existing = entries
      .find(e => e.employee_id === form.employee_id)
      ?.records.find(r => r.date === form.date);
    if (existing) {
      setForm(f => ({ ...f, error: "បានកត់ច្បាប់ថ្ងៃនេះរួចហើយ" })); return;
    }

    setForm(f => ({ ...f, submitting: true, error: "" }));
    const { error } = await supabase.from("leave_records").insert({
      employee_id: form.employee_id,
      date: form.date,
      type: form.type,
    });

    if (error) {
      setForm(f => ({ ...f, submitting: false, error: error.message }));
      return;
    }
    setForm(f => ({ ...f, open: false, submitting: false }));
    load();
  }

  async function deleteLeave(id: string) {
    if (!confirm("លុបច្បាប់នេះ?")) return;
    await supabase.from("leave_records").delete().eq("id", id);
    load();
  }

  const filtered = deptFilter === "all" ? entries : entries.filter(e => e.department === deptFilter);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 font-khmer">ការគ្រប់គ្រងច្បាប់ {YEAR}</h1>
          <p className="text-sm text-gray-500 mt-1">
            ច្បាប់ប្រចាំឆ្នាំ: 18 ថ្ងៃ (អាយុការងារ &lt;10 ឆ្នាំ) · 19 ថ្ងៃ (10 ឆ្នាំ+)
          </p>
        </div>

        {/* How-to info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm font-khmer text-blue-800">
          <div className="font-bold mb-1">របៀបកត់ច្បាប់</div>
          <div className="flex flex-col gap-1 text-blue-700">
            <span>📝 <strong>មុនថ្ងៃ:</strong> បុគ្គលិកបញ្ជូនសំបុត្រ → អ្នកគ្រប់គ្រងវាយបញ្ចូលនៅទីនេះ</span>
            <span>📞 <strong>ថ្ងៃដូចគ្នា:</strong> បុគ្គលិកទូរស័ព្ទ → អ្នកគ្រប់គ្រងវាយបញ្ចូលនៅទីនេះ</span>
          </div>
        </div>

        {/* Dept filter */}
        <div className="flex gap-2 flex-wrap mb-4 overflow-x-auto">
          {["all", ...DEPARTMENTS].map(d => (
            <button key={d} onClick={() => setDeptFilter(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-khmer border whitespace-nowrap min-h-[36px] ${
                deptFilter === d ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200"
              }`}>
              {d === "all" ? "ទាំងអស់" : d}
            </button>
          ))}
        </div>

        {/* Employee list */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 font-khmer">កំពុងផ្ទុក...</div>
        ) : (
          <div className="space-y-3">
            {DEPARTMENTS.map(dept => {
              const deptEntries = filtered.filter(e => e.department === dept);
              if (!deptEntries.length) return null;
              return (
                <div key={dept}>
                  {deptFilter === "all" && (
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wide px-1 mb-2 mt-4">{dept}</div>
                  )}
                  {deptEntries.map(emp => {
                    const pct = Math.min(100, (emp.used / emp.entitlement) * 100);
                    const danger = emp.remaining <= 3;
                    return (
                      <div key={emp.employee_id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold font-khmer text-gray-900">{emp.name}</div>
                            <div className="text-xs text-gray-400">{emp.employee_id} · {calcTenureYears(
                              EMPLOYEES.find(e => e.id === emp.employee_id)?.start_date ?? ""
                            )} ឆ្នាំ</div>

                            {/* Progress bar */}
                            <div className="mt-2 mb-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-500">ប្រើ {emp.used}/{emp.entitlement} ថ្ងៃ</span>
                                <span className={`font-bold ${danger ? "text-red-600" : "text-green-700"}`}>
                                  នៅសល់ {emp.remaining} ថ្ងៃ
                                </span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${danger ? "bg-red-500" : "bg-green-500"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>

                            {/* Recent leave records */}
                            {emp.records.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {emp.records.slice(0, 6).map(r => (
                                  <div key={r.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 text-xs">
                                    <span className="text-gray-600">{r.date}</span>
                                    <span className={`font-semibold ${r.type === "full" ? "text-orange-600" : "text-yellow-600"}`}>
                                      {r.type === "full" ? "1ថ្ងៃ" : "½ថ្ងៃ"}
                                    </span>
                                    <button onClick={() => deleteLeave(r.id)}
                                      className="text-gray-300 hover:text-red-500 ml-0.5 leading-none">×</button>
                                  </div>
                                ))}
                                {emp.records.length > 6 && (
                                  <span className="text-xs text-gray-400 self-center">+{emp.records.length - 6}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Record leave button */}
                          <button
                            onClick={() => openForm(emp)}
                            disabled={emp.remaining <= 0}
                            className="flex-shrink-0 bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-khmer font-bold px-3 py-2 rounded-lg min-h-[44px] min-w-[72px]"
                          >
                            + ច្បាប់
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leave form modal */}
      {form.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h2 className="text-lg font-bold font-khmer text-gray-900 mb-1">កត់ច្បាប់</h2>
            <p className="text-sm font-khmer text-gray-500 mb-4">{form.name}</p>

            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-semibold font-khmer text-gray-700 mb-1">ថ្ងៃឈប់</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold font-khmer text-gray-700 mb-2">ប្រភេទ</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["full", "half"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`py-3 rounded-xl border-2 font-khmer text-sm font-bold transition-colors ${
                        form.type === t
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {t === "full" ? "ឈប់ 1 ថ្ងៃ" : "ឈប់ ½ ថ្ងៃ"}
                    </button>
                  ))}
                </div>
              </div>

              {form.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm font-khmer text-red-700">
                  {form.error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setForm(f => ({ ...f, open: false }))}
                  className="flex-1 py-3 rounded-xl border border-gray-200 font-khmer text-gray-600 font-semibold"
                >
                  បោះបង់
                </button>
                <button
                  onClick={submitLeave}
                  disabled={form.submitting}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-khmer font-bold disabled:opacity-50"
                >
                  {form.submitting ? "..." : "រក្សាទុក"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
