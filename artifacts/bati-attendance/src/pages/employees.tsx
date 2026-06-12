import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { CheckCircle, XCircle, Upload, Camera } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES, DEPARTMENTS } from "@/lib/employees";
import { calcTenureYears } from "@/lib/utils";
import type { Employee } from "@/lib/supabase";

const BUCKET = "employee-faces";
const TG_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string | undefined;
const TG_CHAT  = import.meta.env.VITE_TELEGRAM_CHAT_ID  as string | undefined;

// Audit trail: every face enrollment/change is posted to the Telegram group
// so photos can't be silently swapped.
async function notifyEnrollment(blob: Blob, caption: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const fd = new FormData();
    fd.append("chat_id", TG_CHAT); fd.append("caption", caption); fd.append("photo", blob, "face.jpg");
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, { method: "POST", body: fd });
  } catch { /* non-blocking */ }
}

// Supabase storage requires ASCII-safe filenames
function faceFilename(employeeId: string) {
  return encodeURIComponent(employeeId).replace(/%/g, "_") + ".jpg";
}

function getFaceUrl(employeeId: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(faceFilename(employeeId));
  return data.publicUrl;
}

export default function EmployeesPage() {
  const [dbEmployees, setDbEmployees]   = useState<Employee[]>([]);
  const [loading, setLoading]           = useState(true);
  const [seeding, setSeeding]           = useState(false);
  const [seedMsg, setSeedMsg]           = useState("");
  // face: { [id]: "loading" | "ok" | "none" | "uploading" }
  const [faceState, setFaceState]       = useState<Record<string, "loading" | "ok" | "none" | "uploading">>({});
  const [faceUrls, setFaceUrls]         = useState<Record<string, string>>({});
  const [bucketReady, setBucketReady]   = useState<boolean | null>(null); // null=checking
  const uploadInputs                    = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    supabase.from("employees").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setDbEmployees(data);
      setLoading(false);
    });
  }, []);

  // Check bucket is accessible
  useEffect(() => {
    supabase.storage.from(BUCKET).list("", { limit: 1 })
      .then(({ error }) => setBucketReady(!error))
      .catch(() => setBucketReady(false));
  }, []);

  // Check which employees already have face photos
  useEffect(() => {
    const list = EMPLOYEES as readonly { id: string; name: string; department: string; start_date: string }[];
    list.forEach(async (emp) => {
      setFaceState((s) => ({ ...s, [emp.id]: "loading" }));
      const url = getFaceUrl(emp.id);
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) {
          setFaceUrls((u) => ({ ...u, [emp.id]: url + "?t=" + Date.now() }));
          setFaceState((s) => ({ ...s, [emp.id]: "ok" }));
        } else {
          setFaceState((s) => ({ ...s, [emp.id]: "none" }));
        }
      } catch {
        setFaceState((s) => ({ ...s, [emp.id]: "none" }));
      }
    });
  }, []);

  async function uploadFace(employeeId: string, file: File) {
    if (!bucketReady) {
      toast.error("Storage bucket not set up", {
        description: "Run the storage SQL in your Supabase dashboard first.",
        duration: 6000,
      });
      return;
    }
    setFaceState((s) => ({ ...s, [employeeId]: "uploading" }));
    // Resize to max 400px
    const bitmap = await createImageBitmap(file);
    const maxDim = 400;
    const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.88));

    const { error } = await supabase.storage.from(BUCKET)
      .upload(faceFilename(employeeId), blob, { upsert: true, contentType: "image/jpeg" });

    if (error) {
      toast.error("Upload failed", { description: error.message });
      setFaceState((s) => ({ ...s, [employeeId]: "none" }));
      return;
    }
    toast.success("Photo uploaded successfully");
    const empName = displayList.find((e) => e.id === employeeId)?.name ?? employeeId;
    notifyEnrollment(blob, `📸 រូបមុខត្រូវបានផ្លាស់ប្តូរ — ${empName} (${employeeId})`);
    const url = getFaceUrl(employeeId) + "?t=" + Date.now();
    setFaceUrls((u) => ({ ...u, [employeeId]: url }));
    setFaceState((s) => ({ ...s, [employeeId]: "ok" }));
    setBucketReady(true);
  }

  async function exportCSV() {
    const { data: logs } = await supabase
      .from("attendance_logs")
      .select("employee_id, date, shift, checked_in_at, checked_out_at, verified")
      .order("date", { ascending: false });

    const idToName: Record<string, string> = {};
    const idToDept: Record<string, string> = {};
    displayList.forEach((e) => { idToName[e.id] = e.name; idToDept[e.id] = e.department; });

    const rows = [["ឈ្មោះ", "អត្តលេខ", "ក្រុម", "ថ្ងៃ", "វេន", "ចូល", "ចេញ", "Verified"]];
    (logs ?? []).forEach((l) => {
      rows.push([
        idToName[l.employee_id] ?? l.employee_id,
        l.employee_id,
        idToDept[l.employee_id] ?? "",
        l.date,
        l.shift === "morning" ? "ព្រឹក" : "រសៀល",
        l.checked_in_at ? new Date(l.checked_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
        l.checked_out_at ? new Date(l.checked_out_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
        l.verified ? "✓" : "",
      ]);
    });
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `bati-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function handleSeed() {
    setSeeding(true); setSeedMsg("កំពុង seed...");
    const rows = (EMPLOYEES as readonly { id: string; name: string; department: string; start_date: string }[])
      .map((e) => ({ ...e, is_active: true }));
    const { error } = await supabase.from("employees").upsert(rows, { onConflict: "id" });
    if (error) { setSeedMsg(error.message); toast.error("Seed failed: " + error.message); }
    else {
      const { data } = await supabase.from("employees").select("*").eq("is_active", true);
      if (data) setDbEmployees(data);
      setSeedMsg("Synced successfully");
      toast.success("Staff synced to database");
    }
    setSeeding(false);
  }

  const displayList = dbEmployees.length > 0
    ? dbEmployees
    : (EMPLOYEES as readonly { id: string; name: string; department: string; start_date: string }[])
        .map((e) => ({ ...e, is_active: true }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 print:hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900 font-khmer">
            បញ្ជីបុគ្គលិក ({displayList.length} នាក់)
          </h1>
          <div className="flex gap-2 flex-wrap">
            {!loading && (
              <button onClick={handleSeed} disabled={seeding}
                className="bg-[#5E8B73] hover:bg-[#3D6B55] text-white font-khmer px-4 py-2 rounded-lg min-h-[44px] disabled:opacity-50 text-sm">
                {seeding ? "..." : dbEmployees.length === 0 ? "Seed Supabase" : "ធ្វើបច្ចុប្បន្នភាពទៅទិន្នន័យរួម"}
              </button>
            )}
            {seedMsg && <span className="text-sm text-gray-600 self-center">{seedMsg}</span>}
            <button onClick={exportCSV}
              className="bg-[#1E2D26] hover:bg-[#0F1A12] text-white px-4 py-2 rounded-lg min-h-[44px] text-sm">
              ទាញយកទិន្នន័យ
            </button>
            <button onClick={() => window.print()}
              className="bg-green-600 hover:bg-green-700 text-white font-khmer px-4 py-2 rounded-lg min-h-[44px] text-sm">
              បោះពុម្ភកាត QR
            </button>
          </div>
        </div>

        {/* Storage setup banner */}
        {bucketReady === false && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-5 text-sm">
            <div className="font-bold text-amber-800 mb-1">⚠️ Storage not set up — face photos disabled</div>
            <div className="text-amber-700 text-xs mb-2">Run this in your <a href="https://supabase.com/dashboard" target="_blank" className="underline">Supabase SQL editor</a>:</div>
            <pre className="text-xs bg-amber-100 rounded p-2 overflow-x-auto text-amber-900 whitespace-pre-wrap">{`INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-faces', 'employee-faces', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "read faces" ON storage.objects
FOR SELECT USING (bucket_id = 'employee-faces');
CREATE POLICY "upload faces" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'employee-faces');
CREATE POLICY "update faces" ON storage.objects
FOR UPDATE USING (bucket_id = 'employee-faces');`}</pre>
          </div>
        )}

        {/* Employee list */}
        {DEPARTMENTS.map((dept) => {
          const members = displayList.filter((e) => e.department === dept);
          if (!members.length) return null;
          return (
            <div key={dept} className="mb-8">
              <h2 className="text-sm font-bold text-[#1E2D26] font-khmer mb-3 border-b-2 border-[#C5E0D0] pb-2 uppercase tracking-wide">
                {dept}
              </h2>
              <div className="grid gap-3">
                {members.map((emp) => {
                  const qrData  = JSON.stringify({ id: emp.id, name: emp.name, department: emp.department, start_date: emp.start_date });
                  const tenure  = calcTenureYears(emp.start_date);
                  const fs      = faceState[emp.id];
                  const faceUrl = faceUrls[emp.id];

                  return (
                    <div key={emp.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-center shadow-sm">
                      {/* QR code */}
                      <div className="flex-shrink-0">
                        <QRCodeSVG value={qrData} size={72} level="M" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base font-khmer text-gray-900">{emp.name}</div>
                        <div className="text-xs text-gray-400">{emp.id} · {tenure} ឆ្នាំ</div>
                        <div className="text-xs font-khmer text-gray-500">{emp.department}</div>
                        <div className="text-xs text-gray-400">ចូលធ្វើការ: {emp.start_date}</div>
                      </div>

                      {/* Face photo */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <button
                          onClick={() => uploadInputs.current[emp.id]?.click()}
                          className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors bg-gray-50 flex items-center justify-center group"
                          title="Upload face photo"
                        >
                          {fs === "ok" && faceUrl ? (
                            <>
                              <img src={faceUrl} alt={emp.name} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Camera size={14} className="text-white" />
                              </div>
                            </>
                          ) : fs === "uploading" ? (
                            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                          ) : fs === "loading" ? (
                            <div className="w-4 h-4 bg-gray-200 rounded-full animate-pulse" />
                          ) : (
                            <Upload size={20} className="text-gray-400" />
                          )}
                        </button>
                        <span className="text-[10px] text-gray-400">
                          {fs === "ok"
                            ? <span className="flex items-center gap-0.5 text-[#3D6B55]"><CheckCircle size={10} /> Photo</span>
                            : <span className="text-gray-400">+ Photo</span>}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={(el) => { uploadInputs.current[emp.id] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFace(emp.id, file);
                            e.target.value = "";
                          }}
                        />
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
            @page { size: A4 portrait; margin: 8mm; }
            .print-page { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
            .pc-wrap { break-inside: avoid; page-break-inside: avoid; padding: 2mm; border: 0.4mm dashed #999; border-radius: 7mm; }
            .pc { width: 100%; height: 128mm; background: #8fba9e; border-radius: 5mm; overflow: hidden; font-family: 'Noto Sans Khmer', sans-serif; display: flex; flex-direction: column; }
            .pc-qr-zone { flex: 1; padding: 3mm 3mm 2mm; display: flex; align-items: stretch; }
            .pc-qr-frame { flex: 1; background: #fff; border-radius: 3mm; padding: 3mm; line-height: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.18); display: flex; align-items: center; justify-content: center; }
            .pc-qr-frame svg { width: 100% !important; height: 100% !important; display: block; }
            .pc-header { padding: 2mm 4mm 3mm; flex-shrink: 0; }
            .pc-name { font-size: 17pt; font-weight: 900; color: #111; line-height: 1.1; }
            .pc-role { font-size: 8pt; color: #1e5c38; font-weight: 600; margin-top: 0.5mm; }
            .pc-info { background: #fff; padding: 3mm 4mm 3mm; flex-shrink: 0; }
            .pc-info-row { display: flex; align-items: baseline; gap: 1.5mm; margin-bottom: 1.8mm; font-size: 8.5pt; }
            .pc-info-label { font-weight: 700; color: #111; white-space: nowrap; }
            .pc-info-val { color: #333; }
          }
        `}</style>
        <div className="print-page">
          {displayList.map((emp) => {
            const qrData = JSON.stringify({ id: emp.id, name: emp.name, department: emp.department, start_date: emp.start_date });
            const role   = emp.id.startsWith("ប្រធាន") ? "ប្រធាន" : "បុគ្គលិក";
            return (
              <div key={emp.id} className="pc-wrap">
                <div className="pc">
                  <div className="pc-qr-zone"><div className="pc-qr-frame"><QRCodeSVG value={qrData} size={280} level="H" /></div></div>
                  <div className="pc-header">
                    <div className="pc-name">{emp.name}</div>
                    <div className="pc-role">គូនាទី – {role} ({emp.department})</div>
                  </div>
                  <div className="pc-info">
                    <div className="pc-info-row"><span className="pc-info-label">អត្តលេខ:</span><span className="pc-info-val">{emp.id}</span></div>
                    <div className="pc-info-row"><span className="pc-info-label">លេខទូរស័ព្ទ:</span><span className="pc-info-val"></span></div>
                    <div className="pc-info-row"><span className="pc-info-label">ក្រុមហ៊ុន:</span><span className="pc-info-val">បាទី ហូលឌីង</span></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
