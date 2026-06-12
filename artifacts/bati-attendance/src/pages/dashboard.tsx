import { useEffect, useState, useCallback } from "react";
import { XCircle, Minus, LogIn, LogOut, Download, Sunrise, Sunset, UserX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import { downloadCsv } from "@/lib/export";
import {
  getTodayDate,
  getMonthStart,
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
        return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700"><XCircle size={14} /></span>;
      }
      return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-400"><Minus size={14} /></span>;
    }
    const inTime = fmt(log.checked_in_at);
    const outTime = fmt(log.checked_out_at ?? null);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="flex items-center gap-0.5 text-xs text-green-700 font-semibold leading-tight"><LogIn size={12} /> {inTime}</span>
        {outTime
          ? <span className="flex items-center gap-0.5 text-xs text-[#3D6B55] font-semibold leading-tight"><LogOut size={12} /> {outTime}</span>
          : <span className="text-xs text-orange-500 leading-tight">...</span>
        }
      </div>
    );
  }

  function BonusBadge({ days, leaveUsed }: { days: number; leaveUsed: number }) {
    const effectiveAbsent = Math.max(0, 26 - days - leaveUsed);
    if (days + leaveUsed < 26) {
      return <span className="text-xs text-gray-400 font-khmer">កំពុងរង់ចាំ</span>;
    }
    if (effectiveAbsent === 0) return <span className="text-xs text-green-700 font-bold">$12</span>;
    if (effectiveAbsent === 1) return <span className="text-xs text-yellow-600 font-bold">$6</span>;
    return <span className="text-xs text-red-600 font-bold">$0</span>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h1>
            <p className="text-xs text-gray-400 mt-1">
              បច្ចុប្បន្នភាពចុងក្រោយ៖ {lastRefresh.toLocaleTimeString()}
              {loading && <span className="ml-2 animate-pulse">...</span>}
            </p>
          </div>
          <button
            onClick={() => {
              const todayStr = new Date().toISOString().split("T")[0];
              downloadCsv(
                `Attendance_${todayStr}.csv`,
                ["Name", "Department", "Employee ID", "Morning In", "Morning Out", "Afternoon In", "Afternoon Out", "Days This Month", "Leave Used", "Status"],
                employees.map(e => {
                  const mIn  = e.morningLog?.checked_in_at   ? new Date(e.morningLog.checked_in_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                  const mOut = e.morningLog?.checked_out_at  ? new Date(e.morningLog.checked_out_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                  const aIn  = e.afternoonLog?.checked_in_at  ? new Date(e.afternoonLog.checked_in_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                  const aOut = e.afternoonLog?.checked_out_at ? new Date(e.afternoonLog.checked_out_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                  const status = e.morningLog || e.afternoonLog ? "Present" : "Absent";
                  return [e.name, e.department, e.id, mIn, mOut, aIn, aOut, e.daysThisMonth, e.leaveUsed, status];
                })
              );
            }}
            className="bg-[#5E8B73] hover:bg-[#3D6B55] text-white text-sm font-semibold px-4 py-2 rounded-lg min-h-[40px] flex items-center gap-1.5 flex-shrink-0"
          >
            <Download size={16} /> ទាញយកទិន្នន័យ
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {/* Morning In */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 font-khmer">ចូលព្រឹក</span>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-50">
                <Sunrise size={16} className="text-green-600" />
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{morningPresent}</div>
            <div className="text-xs text-gray-400 mt-1">of {employees.length} staff</div>
          </div>

          {/* Afternoon In */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 font-khmer">ចូលរសៀល</span>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#EBF5EF]">
                <Sunset size={16} className="text-[#3D6B55]" />
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{afternoonPresent}</div>
            <div className="text-xs text-gray-400 mt-1">of {employees.length} staff</div>
          </div>

          {/* Absent */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 font-khmer">អវត្តមាន</span>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50">
                <UserX size={16} className="text-red-500" />
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{absent}</div>
            <div className={`text-xs mt-1 font-medium ${absent > 5 ? "text-red-500" : "text-gray-400"}`}>
              {absent === 0 ? "Full attendance" : `${absent} missing today`}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {["all", ...DEPARTMENTS].map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={`px-3 py-2 rounded-lg text-sm font-khmer min-h-[40px] border transition-colors ${
                deptFilter === d
                  ? "bg-[#5E8B73] text-white border-[#5E8B73]"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {d === "all" ? "ទាំងអស់" : d}
            </button>
          ))}
        </div>

        {loading && employees.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">កំពុងដំណើរការ...</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm font-khmer">
            រកមិនឃើញបុគ្គលិក —{" "}
            <a href="/employees" className="text-[#3D6B55] underline">បន្ថែមបុគ្គលិក</a>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-khmer">ឈ្មោះ</th>
                    <th className="text-left px-4 py-3 text-gray-600 hidden sm:table-cell">ID</th>
                    <th className="text-center px-3 py-3 text-gray-600 font-khmer">ព្រឹក</th>
                    <th className="text-center px-3 py-3 text-gray-600 font-khmer">រសៀល</th>
                    <th className="text-center px-3 py-3 text-gray-600 font-khmer hidden md:table-cell">ថ្ងៃ</th>
                    <th className="text-center px-3 py-3 text-gray-600 hidden md:table-cell">ប្រាក់រង្វាន់</th>
                    <th className="text-center px-3 py-3 text-gray-600 font-khmer hidden lg:table-cell">ច្បាប់នៅសល់</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPARTMENTS.map((dept) => {
                    const deptRows = filtered.filter((e) => e.department === dept);
                    if (!deptRows.length) return null;
                    return [
                      deptFilter === "all" && (
                        <tr key={`header-${dept}`} className="bg-[#EBF5EF]">
                          <td colSpan={7} className="px-4 py-2 font-bold text-[#1E2D26] font-khmer text-xs">
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
