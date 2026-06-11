import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import type { Employee } from "@/lib/supabase";

const FULL_BONUS = 16;
const PARTIAL_BONUS = 6;
const WORK_DAYS = 26;

type BonusStatus = "full" | "partial" | "none" | "pending";

type PayRow = {
  employee: Employee;
  presentDays: number;
  leavedays: number;
  effectiveDays: number;
  absences: number;
  bonusStatus: BonusStatus;
  bonus: number;
  paidAt: string | null;
  payrollId: string | null;
};

function getMonthOptions(): { value: string; label: string }[] {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 15; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    opts.push({ value: val, label });
  }
  return opts;
}

function calcBonus(effectiveDays: number, isCurrentMonth: boolean): { status: BonusStatus; bonus: number } {
  if (isCurrentMonth) return { status: "pending", bonus: 0 };
  const absences = Math.max(0, WORK_DAYS - effectiveDays);
  if (absences === 0) return { status: "full", bonus: FULL_BONUS };
  if (absences === 1) return { status: "partial", bonus: PARTIAL_BONUS };
  return { status: "none", bonus: 0 };
}

export default function FinancePage() {
  const monthOpts = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOpts[1].value); // default: last month
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("all");
  const [paying, setPaying] = useState<string | null>(null);

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = `${selectedMonth}-01`;
    const end = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

    const [logsRes, leaveRes, payrollRes, empRes] = await Promise.all([
      supabase.from("attendance_logs").select("employee_id, date").gte("date", start).lte("date", end),
      supabase.from("leave_records").select("employee_id, date, type").gte("date", start).lte("date", end),
      supabase.from("payroll_records").select("*").eq("month", selectedMonth),
      supabase.from("employees").select("*").eq("is_active", true),
    ]);

    const emps: Employee[] = empRes.data ?? [];
    const logs = logsRes.data ?? [];
    const leaves = leaveRes.data ?? [];
    const payroll = payrollRes.data ?? [];

    const isCurrentMonth = selectedMonth === currentMonth;

    const payRows: PayRow[] = emps.map((emp) => {
      const presentDates = new Set(logs.filter((l) => l.employee_id === emp.id).map((l) => l.date));
      const empLeaves = leaves.filter((l) => l.employee_id === emp.id);
      const leavedays = empLeaves.reduce((s, l) => s + (l.type === "full" ? 1 : 0.5), 0);
      const presentDays = presentDates.size;
      const effectiveDays = presentDays + leavedays;
      const absences = Math.max(0, WORK_DAYS - effectiveDays);
      const { status, bonus } = calcBonus(effectiveDays, isCurrentMonth);

      const pr = payroll.find((p) => p.employee_id === emp.id);

      return {
        employee: emp,
        presentDays,
        leavedays,
        effectiveDays,
        absences,
        bonusStatus: status,
        bonus: pr ? pr.bonus : bonus,
        paidAt: pr?.paid_at ?? null,
        payrollId: pr?.id ?? null,
      };
    });

    setRows(payRows);
    setLoading(false);
  }, [selectedMonth, currentMonth]);

  useEffect(() => { load(); }, [load]);

  async function markPaid(row: PayRow) {
    if (row.bonusStatus === "pending") return;
    setPaying(row.employee.id);
    if (row.payrollId) {
      // Toggle: unpay if already paid
      if (row.paidAt) {
        await supabase.from("payroll_records").update({ paid_at: null }).eq("id", row.payrollId);
      } else {
        await supabase.from("payroll_records").update({ paid_at: new Date().toISOString() }).eq("id", row.payrollId);
      }
    } else {
      await supabase.from("payroll_records").insert({
        employee_id: row.employee.id,
        month: selectedMonth,
        bonus: row.bonus,
        paid_at: new Date().toISOString(),
      });
    }
    setPaying(null);
    load();
  }

  const filtered = deptFilter === "all" ? rows : rows.filter((r) => r.employee.department === deptFilter);
  const totalOwed = rows.filter((r) => !r.paidAt && r.bonusStatus !== "pending").reduce((s, r) => s + r.bonus, 0);
  const totalPaid = rows.filter((r) => r.paidAt).reduce((s, r) => s + r.bonus, 0);
  const fullCount = rows.filter((r) => r.bonusStatus === "full").length;
  const partialCount = rows.filter((r) => r.bonusStatus === "partial").length;

  function BonusBadge({ status, bonus }: { status: BonusStatus; bonus: number }) {
    if (status === "full") return <span className="text-green-700 font-bold text-sm">${bonus}</span>;
    if (status === "partial") return <span className="text-yellow-600 font-bold text-sm">${bonus}</span>;
    if (status === "none") return <span className="text-red-500 font-bold text-sm">$0</span>;
    return <span className="text-gray-400 text-xs font-khmer">មិនទាន់</span>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-4xl mx-auto px-4 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h1 className="text-xl font-bold font-khmer text-gray-900">ហិរញ្ញវត្ថុ / Payroll</h1>
            <p className="text-xs text-gray-500 mt-0.5">ប្រាក់លើកទឹកចិត្ត: 26ថ្ងៃ=${FULL_BONUS} · ខ្វះ1ថ្ងៃ=${PARTIAL_BONUS} · ខ្វះ2+=$0</p>
          </div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-h-[40px] max-w-[180px]"
          >
            {monthOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-green-700">{fullCount}</div>
            <div className="text-xs text-gray-500">$16 Full</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-yellow-600">{partialCount}</div>
            <div className="text-xs text-gray-500">$6 Partial</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-red-600">${totalOwed}</div>
            <div className="text-xs text-gray-500 font-khmer">នៅជំពាក់</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
            <div className="text-xl font-bold text-blue-600">${totalPaid}</div>
            <div className="text-xs text-gray-500 font-khmer">បានបង់</div>
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

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 font-khmer">កំពុងផ្ទុក...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-khmer text-gray-600 font-semibold">ឈ្មោះ</th>
                    <th className="text-center px-2 py-3 text-gray-600 font-semibold">ថ្ងៃ</th>
                    <th className="text-center px-2 py-3 text-gray-600 font-semibold">ច្បាប់</th>
                    <th className="text-center px-2 py-3 text-gray-600 font-semibold">សរុប</th>
                    <th className="text-center px-2 py-3 text-gray-600 font-semibold">ប្រាក់</th>
                    <th className="text-center px-3 py-3 text-gray-600 font-semibold">ស្ថានភាព</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPARTMENTS.map((dept) => {
                    const deptRows = filtered.filter((r) => r.employee.department === dept);
                    if (!deptRows.length) return null;
                    return [
                      deptFilter === "all" && (
                        <tr key={`hdr-${dept}`} className="bg-blue-50">
                          <td colSpan={6} className="px-4 py-1.5 font-bold text-blue-800 font-khmer text-xs">{dept}</td>
                        </tr>
                      ),
                      ...deptRows.map((row) => (
                        <tr key={row.employee.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="font-khmer text-gray-900 font-medium">{row.employee.name}</div>
                            <div className="text-xs text-gray-400">{row.employee.id}</div>
                          </td>
                          <td className="px-2 py-2.5 text-center text-gray-700 font-semibold">{row.presentDays}</td>
                          <td className="px-2 py-2.5 text-center text-blue-600 font-semibold">
                            {row.leavedays > 0 ? `+${row.leavedays}` : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span className={`font-bold ${row.effectiveDays >= 26 ? "text-green-700" : row.effectiveDays >= 25 ? "text-yellow-600" : "text-red-600"}`}>
                              {row.effectiveDays}/26
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <BonusBadge status={row.bonusStatus} bonus={row.bonus} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {row.bonusStatus === "pending" ? (
                              <span className="text-xs text-gray-400 font-khmer">មិនទាន់</span>
                            ) : row.paidAt ? (
                              <button
                                onClick={() => markPaid(row)}
                                disabled={paying === row.employee.id}
                                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold border border-green-200 min-h-[32px]"
                              >
                                ✓ បានបង់
                              </button>
                            ) : (
                              <button
                                onClick={() => markPaid(row)}
                                disabled={paying === row.employee.id || row.bonus === 0}
                                className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold border border-orange-200 min-h-[32px] disabled:opacity-40"
                              >
                                {paying === row.employee.id ? "..." : "បង់ →"}
                              </button>
                            )}
                          </td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
