import { useEffect, useState, useCallback } from "react";
import { Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { CircleProgress } from "@/components/ui/circle-progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import {
  calcLeaveEntitlement, calcTenureYears,
  getLeaveYearBounds, calcMonthlyLeaveUsed, MONTHLY_LEAVE_CAP
} from "@/lib/utils";
import { downloadCsv } from "@/lib/export";
import type { LeaveRecord } from "@/lib/supabase";

type LeaveEntry = {
  employee_id: string;
  name: string;
  department: string;
  start_date: string;
  entitlement: number;
  used: number;
  remaining: number;
  records: LeaveRecord[];
  leaveYearFrom: string;
  leaveYearTo: string;
};

type FormState = {
  open: boolean;
  employee_id: string;
  name: string;
  start_date: string;
  date: string;
  type: "full" | "half";
  submitting: boolean;
  error: string;
};

export default function LeavePage() {
  const [entries, setEntries] = useState<LeaveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("all");
  const [form, setForm] = useState<FormState>({
    open: false, employee_id: "", name: "", start_date: "",
    date: new Date().toISOString().split("T")[0],
    type: "full", submitting: false, error: "",
  });

  const load = useCallback(async () => {
    // Fetch a wide range covering all possible leave years
    const { data: records } = await supabase
      .from("leave_records")
      .select("*")
      .order("date", { ascending: false });

    const allRecords: LeaveRecord[] = records ?? [];

    const data: LeaveEntry[] = EMPLOYEES.map((emp) => {
      const bounds = getLeaveYearBounds(emp.start_date);
      const empRecords = allRecords.filter(
        (r) => r.employee_id === emp.id && r.date >= bounds.from && r.date <= bounds.to
      );
      const used = empRecords.reduce((s, r) => s + (r.type === "full" ? 1 : 0.5), 0);
      const entitlement = calcLeaveEntitlement(emp.start_date);
      return {
        employee_id: emp.id,
        name: emp.name,
        department: emp.department,
        start_date: emp.start_date,
        entitlement,
        used,
        remaining: entitlement - used,
        records: empRecords,
        leaveYearFrom: bounds.from,
        leaveYearTo: bounds.to,
      };
    });

    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openForm(emp: LeaveEntry) {
    setForm(f => ({ ...f, open: true, employee_id: emp.employee_id, name: emp.name, start_date: emp.start_date, error: "" }));
  }

  async function submitLeave() {
    if (!form.date) { setForm(f => ({ ...f, error: "សូមជ្រើសរើសថ្ងៃ" })); return; }

    const emp = entries.find(e => e.employee_id === form.employee_id);

    // Check duplicate date
    if (emp?.records.find(r => r.date === form.date)) {
      setForm(f => ({ ...f, error: "បានកត់ច្បាប់ថ្ងៃនេះរួចហើយ" })); return;
    }

    // Check monthly cap (1.5 days max per month)
    const yearMonth = form.date.slice(0, 7); // YYYY-MM
    const monthUsed = calcMonthlyLeaveUsed(emp?.records ?? [], yearMonth);
    const newAmount = form.type === "full" ? 1 : 0.5;
    if (monthUsed + newAmount > MONTHLY_LEAVE_CAP) {
      const remaining = MONTHLY_LEAVE_CAP - monthUsed;
      setForm(f => ({
        ...f,
        error: `លើស 1.5 ថ្ងៃ/ខែ — ខែនេះបានប្រើ ${monthUsed} ថ្ងៃ (នៅសល់ ${remaining} ថ្ងៃ)`
      }));
      return;
    }

    // Check annual balance
    if (emp && emp.remaining < newAmount) {
      setForm(f => ({ ...f, error: `ច្បាប់ប្រចាំឆ្នាំអស់ (នៅសល់ ${emp.remaining} ថ្ងៃ)` })); return;
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
    toast.success("បានកត់ត្រាច្បាប់ឈប់");
    load();
  }

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; date: string } | null>(null);

  async function deleteLeave(id: string) {
    await supabase.from("leave_records").delete().eq("id", id);
    setDeleteTarget(null);
    toast.success("បានលុបច្បាប់");
    load();
  }

  const filtered = deptFilter === "all" ? entries : entries.filter(e => e.department === deptFilter);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* Header */}
        <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-khmer">ច្បាប់ឈប់សម្រាកប្រចាំឆ្នាំ {new Date().getFullYear()}</h1>
          </div>
          <button
            onClick={() => {
              // Summary rows
              const summaryRows = entries.map(e => [
                e.name, e.department, e.employee_id,
                e.leaveYearFrom, e.leaveYearTo,
                e.entitlement, e.used, e.remaining,
              ]);
              // Detail rows (each leave record)
              const detailRows: (string | number)[][] = [];
              entries.forEach(e => {
                e.records.forEach(r => {
                  detailRows.push([e.name, e.department, e.employee_id, r.date, r.type === "full" ? "Full Day" : "Half Day"]);
                });
              });
              downloadCsv(
                `Leave_Summary_${new Date().getFullYear()}.csv`,
                ["Name", "Department", "Employee ID", "Leave Year From", "Leave Year To", "Entitlement", "Used", "Remaining"],
                summaryRows
              );
              // Small delay then export detail sheet
              setTimeout(() => downloadCsv(
                `Leave_Detail_${new Date().getFullYear()}.csv`,
                ["Name", "Department", "Employee ID", "Date", "Type"],
                detailRows
              ), 300);
            }}
            className="bg-[#5E8B73] hover:bg-[#3D6B55] text-white text-sm font-semibold px-4 py-2 rounded-lg min-h-[40px] flex items-center gap-1.5 flex-shrink-0"
          >
            <Download size={16} /> ទាញយកទិន្នន័យ
          </button>
        </div>

        {/* Dept filter */}
        <div className="flex gap-2 flex-wrap mb-4 overflow-x-auto">
          {["all", ...DEPARTMENTS].map(d => (
            <button key={d} onClick={() => setDeptFilter(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-khmer border whitespace-nowrap min-h-[36px] ${
                deptFilter === d ? "bg-[#5E8B73] text-white border-[#5E8B73]" : "bg-white text-gray-700 border-gray-200"
              }`}>
              {d === "all" ? "ទាំងអស់" : d}
            </button>
          ))}
        </div>

        {/* Employee list */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm font-khmer">កំពុងដំណើរការ...</div>
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
                    const danger = emp.remaining <= 3;
                    return (
                      <div key={emp.employee_id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          {/* Circle progress */}
                          <div className="relative flex-shrink-0 flex flex-col items-center">
                            <CircleProgress value={emp.used} maxValue={emp.entitlement} size={56} strokeWidth={5} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={`text-[10px] font-bold ${danger ? "text-red-600" : "text-[#3D6B55]"}`}>
                                {emp.remaining}d
                              </span>
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-bold font-khmer text-gray-900">{emp.name}</div>
                            <div className="text-xs text-gray-400">
                              {emp.employee_id} · {calcTenureYears(emp.start_date)} ឆ្នាំ
                            </div>
                            <div className="text-xs font-khmer mt-0.5">
                              <span className="text-gray-500">បានប្រើ {emp.used}/{emp.entitlement} ថ្ងៃ · </span>
                              <span className={`font-semibold ${danger ? "text-red-600" : "text-[#3D6B55]"}`}>
                                {emp.remaining} ថ្ងៃនៅសល់
                              </span>
                            </div>

                            {/* Recent leave records */}
                            {emp.records.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {emp.records.slice(0, 6).map(r => (
                                  <div key={r.id} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-0.5 text-xs">
                                    <span className="text-gray-600">{r.date}</span>
                                    <span className={`font-semibold ${r.type === "full" ? "text-orange-600" : "text-yellow-600"}`}>
                                      {r.type === "full" ? "ពេញ" : "កន្លះ"}
                                    </span>
                                    <button onClick={() => setDeleteTarget({ id: r.id, date: r.date })}
                                      className="text-gray-400 hover:text-red-500 -m-1 p-1.5 leading-none flex items-center"><X size={14} /></button>
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
                            className="flex-shrink-0 bg-[#5E8B73] disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold px-3 py-2 rounded-lg min-h-[44px] min-w-[64px] flex items-center justify-center gap-1"
                          >
                            <Plus size={14} /> បន្ថែម
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="លុបច្បាប់នេះ?"
        description={deleteTarget ? `ថ្ងៃ ${deleteTarget.date} — មិនអាចត្រឡប់វិញបានទេ` : undefined}
        confirmLabel="លុប"
        destructive
        onConfirm={() => deleteTarget && deleteLeave(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Leave form modal */}
      {form.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1 font-khmer">កត់ត្រាការឈប់សម្រាក</h2>
            <p className="text-sm font-khmer text-gray-500 mb-4">{form.name}</p>

            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1 font-khmer">ថ្ងៃខែឆ្នាំ</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A9CBB7]"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 font-khmer">ប្រភេទ</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["full", "half"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                        form.type === t
                          ? "border-[#5E8B73] bg-[#EBF5EF] text-[#3D6B55]"
                          : "border-gray-200 text-gray-600"
                      }`}
                    >
                      {t === "full" ? "ពេញមួយថ្ងៃ" : "កន្លះថ្ងៃ"}
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
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold font-khmer"
                >
                  បោះបង់
                </button>
                <button
                  onClick={submitLeave}
                  disabled={form.submitting}
                  className="flex-1 py-3 rounded-xl bg-[#5E8B73] text-white font-bold disabled:opacity-50 font-khmer"
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
