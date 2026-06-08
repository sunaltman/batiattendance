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
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;900&display=swap');

          @media print {
          @page { size: A4 portrait; margin: 10mm; }

          .print-page {
            display: grid;
            grid-template-columns: repeat(2, 88mm);
            gap: 6mm;
            justify-content: center;
          }

          /* Card: portrait, matches template proportions */
          .pc {
            width: 88mm;
            height: 124mm;
            background: #fff;
            border-radius: 5mm;
            border: 2.5px solid #8bbfaa;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
            display: flex;
            flex-direction: column;
            font-family: 'Noto Sans Khmer', sans-serif;
          }

          /* Top QR area — mint bg, ~60% of card height */
          .pc-art {
            flex: 0 0 70mm;
            background: #dff0ea;
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 2px solid #8bbfaa;
          }

          /* QR code white tile */
          .pc-qr {
            background: #fff;
            padding: 3mm;
            border-radius: 3mm;
            border: 1.5px solid #8bbfaa;
            line-height: 0;
          }

          /* Force SVG to physical size */
          .pc-qr svg {
            width: 56mm !important;
            height: 56mm !important;
            display: block;
          }

          /* Info section */
          .pc-body {
            flex: 1;
            padding: 3mm 4.5mm 3.5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          .pc-name {
            font-size: 16pt;
            font-weight: 900;
            color: #111;
            line-height: 1.15;
          }

          .pc-role {
            font-size: 8pt;
            color: #3a9e7e;
            font-weight: 600;
            margin-top: 0.8mm;
          }

          .pc-divider {
            height: 0.5mm;
            background: #c5e3d8;
            margin: 2mm 0;
          }

          .pc-fields { display: flex; flex-direction: column; gap: 1mm; }

          .pc-row {
            display: flex;
            align-items: baseline;
            gap: 1.5mm;
            font-size: 7.5pt;
          }

          .pc-label { font-weight: 700; color: #1a1a1a; white-space: nowrap; }
          .pc-val   { color: #444; }

          .pc-company {
            font-size: 7pt;
            color: #666;
            margin-top: 1mm;
          }
          } /* end @media print */
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
                <div className="pc-art">
                  <div className="pc-qr">
                    <QRCodeSVG value={qrData} size={212} level="H" />
                  </div>
                </div>
                <div className="pc-body">
                  <div>
                    <div className="pc-name">{emp.name}</div>
                    <div className="pc-role">{role} – {emp.department}</div>
                    <div className="pc-divider" />
                    <div className="pc-fields">
                      <div className="pc-row">
                        <span className="pc-label">អត្តលេខ:</span>
                        <span className="pc-val">{emp.id}</span>
                      </div>
                      <div className="pc-row">
                        <span className="pc-label">ចូលធ្វើការ:</span>
                        <span className="pc-val">{emp.start_date} · {tenure} ឆ្នាំ</span>
                      </div>
                    </div>
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
