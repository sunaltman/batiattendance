import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import { calcTenureYears } from "@/lib/utils";
import type { Employee } from "@/lib/supabase";

export default function EmployeesPage() {
  const [dbEmployees, setDbEmployees] = useState<Employee[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  useEffect(() => {
    supabase.from("employees").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setDbEmployees(data);
    });
  }, []);

  async function handleSeed() {
    setSeeding(true);
    setSeedMsg("កំពុង seed...");
    const rows = EMPLOYEES.map((e) => ({ ...e, is_active: true }));
    const { error } = await supabase.from("employees").upsert(rows, { onConflict: "id" });
    if (error) {
      setSeedMsg(`❌ ${error.message}`);
    } else {
      const { data } = await supabase.from("employees").select("*").eq("is_active", true);
      if (data) setDbEmployees(data);
      setSeedMsg("✅ Seed ជោគជ័យ!");
    }
    setSeeding(false);
  }

  const displayList = dbEmployees.length > 0 ? dbEmployees : EMPLOYEES.map((e) => ({ ...e, is_active: true }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 print:hidden">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900 font-khmer">បញ្ជីបុគ្គលិក ({displayList.length} នាក់)</h1>
          <div className="flex gap-3 flex-wrap">
            {dbEmployees.length === 0 && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="bg-blue-600 hover:bg-blue-700 text-white font-khmer px-4 py-2 rounded-lg min-h-[44px] disabled:opacity-50"
              >
                {seeding ? "..." : "បន្ថែមបុគ្គលិកទៅ Supabase"}
              </button>
            )}
            {seedMsg && <span className="text-sm text-gray-600 self-center">{seedMsg}</span>}
            <button
              onClick={() => window.print()}
              className="bg-green-600 hover:bg-green-700 text-white font-khmer px-4 py-2 rounded-lg min-h-[44px]"
            >
              បោះពុម្ព QR Cards
            </button>
          </div>
        </div>

        {DEPARTMENTS.map((dept) => {
          const members = displayList.filter((e) => e.department === dept);
          if (!members.length) return null;
          return (
            <div key={dept} className="mb-8">
              <h2 className="text-lg font-bold text-blue-800 font-khmer mb-3 border-b-2 border-blue-200 pb-2">{dept}</h2>
              <div className="grid gap-3">
                {members.map((emp) => {
                  const qrData = JSON.stringify({
                    id: emp.id,
                    name: emp.name,
                    department: emp.department,
                    start_date: emp.start_date,
                  });
                  const tenure = calcTenureYears(emp.start_date);
                  return (
                    <div key={emp.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-center shadow-sm">
                      <QRCodeSVG value={qrData} size={80} level="M" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg font-khmer text-gray-900">{emp.name}</div>
                        <div className="text-sm text-gray-500">{emp.id}</div>
                        <div className="text-sm font-khmer text-gray-600">{emp.department}</div>
                        <div className="text-xs text-gray-400">
                          ចូលធ្វើការ: {emp.start_date} · {tenure} ឆ្នាំ
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Print layout ── */}
      <div className="hidden print:block">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700;900&display=swap');

          @page { size: A4; margin: 8mm; }

          * { box-sizing: border-box; }

          body { margin: 0; background: white; }

          .print-page {
            display: grid;
            grid-template-columns: repeat(2, 88mm);
            gap: 5mm;
            justify-content: center;
          }

          .pc {
            width: 88mm;
            background: #fff;
            border-radius: 5mm;
            border: 2.5px solid #8bbfaa;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
            font-family: 'Noto Sans Khmer', sans-serif;
            box-shadow: 0 1px 4px rgba(0,0,0,0.10);
          }

          /* QR illustration area */
          .pc-art {
            height: 44mm;
            background: #e8f4f0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1.5px solid #8bbfaa;
          }

          .pc-qr-wrap {
            background: white;
            padding: 2.5mm;
            border-radius: 2mm;
            border: 1px solid #8bbfaa;
            line-height: 0;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          }

          .pc-body {
            padding: 3mm 4mm 4mm;
          }

          .pc-name {
            font-size: 15pt;
            font-weight: 900;
            color: #1a1a1a;
            line-height: 1.2;
            margin-bottom: 0.5mm;
          }

          .pc-role {
            font-size: 8.5pt;
            color: #3a9e7e;
            font-weight: 600;
            margin-bottom: 2.5mm;
          }

          .pc-divider {
            height: 0.4mm;
            background: #d0e8df;
            margin-bottom: 2.5mm;
          }

          .pc-row {
            display: flex;
            align-items: baseline;
            gap: 1.5mm;
            margin-bottom: 1.5mm;
            font-size: 8pt;
          }

          .pc-label {
            font-weight: 700;
            color: #2a2a2a;
            white-space: nowrap;
          }

          .pc-value {
            color: #444;
          }

          .pc-company {
            font-size: 7.5pt;
            color: #555;
            margin-top: 1mm;
          }
        `}</style>

        <div className="print-page">
          {displayList.map((emp) => {
            const qrData = JSON.stringify({
              id: emp.id,
              name: emp.name,
              department: emp.department,
              start_date: emp.start_date,
            });
            const tenure = calcTenureYears(emp.start_date);
            const role = emp.id.startsWith("ប្រធាន") ? "ប្រធាន" : "បុគ្គលិក";

            return (
              <div key={emp.id} className="pc">
                {/* QR area — replaces the Canva illustration */}
                <div className="pc-art">
                  <div className="pc-qr-wrap">
                    <QRCodeSVG value={qrData} size={100} level="M" />
                  </div>
                </div>

                {/* Info body */}
                <div className="pc-body">
                  <div className="pc-name">{emp.name}</div>
                  <div className="pc-role">{role} – {emp.department}</div>
                  <div className="pc-divider" />
                  <div className="pc-row">
                    <span className="pc-label">អត្តលេខ:</span>
                    <span className="pc-value">{emp.id}</span>
                  </div>
                  <div className="pc-row">
                    <span className="pc-label">ចូលធ្វើការ:</span>
                    <span className="pc-value">{emp.start_date} · {tenure} ឆ្នាំ</span>
                  </div>
                  <div className="pc-company">ក្រុមហ៊ុន: បាទី ហ្យូណេន លីមីតគឺតិត</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
