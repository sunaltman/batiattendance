import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import {
  getTodayDate,
  getMonthStart,
  formatKhmerDate,
  isShiftClosed,
  calcLeaveEntitlement,
  calcLeaveUsed,
  calcTenureYears,
} from "@/lib/utils";
import type { Employee, AttendanceLog, LeaveRecord } from "@/lib/supabase";

type EmpRow = Employee & {
  morningLog: AttendanceLog | null;
  afternoonLog: AttendanceLog | null;
  daysThisMonth: number;
  leaveUsed: number;
  leaveEntitlement: number;
};

export default function DashboardPage() {
  const today = getTodayDate();
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    const monthStart = getMonthStart();

    const [empRes, logsRes, leaveRes] = await Promise.all([
      supabase.from("employees").select("*").eq("is_active", true),
      supabase.from("attendance_logs").select("*").gte("date", monthStart),
      supabase.from("leave_records").select("*").gte("date", monthStart),
    ]);

    const emps: Employee[] = empRes.data ?? [];
    const logs: AttendanceLog[] = logsRes.data ?? [];
    const leaves: LeaveRecord[] = leaveRes.data ?? [];

    const rows: EmpRow[] = emps.map((emp) => {
      const empLogs = logs.filter((l) => l.employee_id === emp.id);
      const todayLogs = empLogs.filter((l) => l.date === today);
      const morningLog = todayLogs.find((l) => l.shift === "morning") ?? null;
      const afternoonLog = todayLogs.find((l) => l.shift === "afternoon") ?? null;

      const empLeaves = leaves.filter((l) => l.employee_id === emp.id);
      const leaveDays = empLeaves.map((l) => ({ type: l.type }));

      const uniqueDays = new Set(
        empLogs.filter((l) => l.date >= monthStart).map((l) => l.date)
      ).size;

      return {
        ...emp,
        morningLog,
        afternoonLog,
        daysThisMonth: uniqueDays,
        leaveUsed: calcLeaveUsed(leaveDays),
        leaveEntitlement: calcLeaveEntitlement(emp.start_date),
      };
    });

    setEmployees(rows);
    setLoading(false);
    setLastRefresh(new Date());
  }, [today]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = deptFilter === "all" ? employees : employees.filter((e) => e.department === deptFilter);

  const morningPresent = employees.filter((e) => e.morningLog).length;
  const afternoonPresent = employees.filter((e) => e.afternoonLog).length;
  const absent = employees.filter((e) => !e.morningLog && !e.afternoonLog).length;

  function fmt(ts: string | null) {
    if (!ts) return null;
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function ShiftCell({ log, shift }: { log: AttendanceLog | null; shift: "morning" | "afternoon" }) {
    if (!log) {
      if (isShiftClosed(shift)) {
        return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 text-xs">✗</span>;
      }
      return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-400 text-xs">○</span>;
    }
    const inTime = fmt(log.checked_in_at);
    const outTime = fmt(log.checked_out_at ?? null);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs text-green-700 font-semibold leading-tight">▶ {inTime}</span>
        {outTime
          ? <span className="text-xs text-blue-700 font-semibold leading-tight">■ {outTime}</span>
          : <span className="text-xs text-orange-500 leading-tight">...</span>
        }
      </div>
    );
  }

  function BonusBadge({ days, leaveUsed }: { days: number; leaveUsed: number }) {
    const effectiveAbsent = Math.max(0, 26 - days - leaveUsed);
    if (days + leaveUsed < 26) {
      return <span className="text-xs text-gray-400 font-khmer">មិនទាន់</span>;
    }
    if (effectiveAbsent === 0) return <span className="text-xs text-green-700 font-bold">$12</span>;
    if (effectiveAbsent === 1) return <span className="text-xs text-yellow-600 font-bold">$6</span>;
    return <span className="text-xs text-red-600 font-bold">$0</span>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 font-khmer">{formatKhmerDate(new Date())}</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          <p className="text-xs text-gray-400 mt-1">
            ធ្វើបច្ចុប្បន្នភាពចុងក្រោយ: {lastRefresh.toLocaleTimeString()}
            {loading && <span className="ml-2 animate-pulse">...</span>}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-700">{morningPresent}</div>
            <div className="text-sm font-khmer text-green-600 mt-1">វេនព្រឹក</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-blue-700">{afternoonPresent}</div>
            <div className="text-sm font-khmer text-blue-600 mt-1">វេនរសៀល</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-red-700">{absent}</div>
            <div className="text-sm font-khmer text-red-600 mt-1">អវត្តមាន</div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {["all", ...DEPARTMENTS].map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={`px-3 py-2 rounded-lg text-sm font-khmer min-h-[40px] border transition-colors ${
                deptFilter === d
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {d === "all" ? "ទាំងអស់" : d}
            </button>
          ))}
        </div>

        {loading && employees.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-khmer">កំពុងផ្ទុក...</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16 text-gray-400 font-khmer">
            មិនមានបុគ្គលិកក្នុង Supabase —{" "}
            <a href="/employees" className="text-blue-600 underline">ទៅ seed</a>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-khmer text-gray-600">ឈ្មោះ</th>
                    <th className="text-left px-4 py-3 text-gray-600 hidden sm:table-cell">ID</th>
                    <th className="text-center px-3 py-3 font-khmer text-gray-600">ព្រឹក</th>
                    <th className="text-center px-3 py-3 font-khmer text-gray-600">រសៀល</th>
                    <th className="text-center px-3 py-3 font-khmer text-gray-600 hidden md:table-cell">ថ្ងៃ/26</th>
                    <th className="text-center px-3 py-3 font-khmer text-gray-600 hidden md:table-cell">Bonus</th>
                    <th className="text-center px-3 py-3 font-khmer text-gray-600 hidden lg:table-cell">ច្បាប់នៅ</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPARTMENTS.map((dept) => {
                    const deptRows = filtered.filter((e) => e.department === dept);
                    if (!deptRows.length) return null;
                    return [
                      deptFilter === "all" && (
                        <tr key={`header-${dept}`} className="bg-blue-50">
                          <td colSpan={7} className="px-4 py-2 font-bold text-blue-800 font-khmer text-xs">
                            {dept} ({deptRows.length})
                          </td>
                        </tr>
                      ),
                      ...deptRows.map((emp) => (
                        <tr key={emp.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-khmer text-gray-900">{emp.name}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">{emp.id}</td>
                          <td className="px-3 py-3 text-center">
                            <ShiftCell log={emp.morningLog} shift="morning" />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <ShiftCell log={emp.afternoonLog} shift="afternoon" />
                          </td>
                          <td className="px-3 py-3 text-center text-gray-700 hidden md:table-cell">
                            {emp.daysThisMonth}
                          </td>
                          <td className="px-3 py-3 text-center hidden md:table-cell">
                            <BonusBadge days={emp.daysThisMonth} leaveUsed={emp.leaveUsed} />
                          </td>
                          <td className="px-3 py-3 text-center text-gray-700 hidden lg:table-cell">
                            {emp.leaveEntitlement - emp.leaveUsed}/{emp.leaveEntitlement}
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
