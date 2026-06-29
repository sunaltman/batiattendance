import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { CheckCircle, Upload, Camera, Printer, AlertTriangle, Plus, FileUp, X } from "lucide-react";
import { supabase, FACE_BUCKET, faceFilename, DS } from "../../lib/supabase";
import type { Employee } from "../../lib/supabase";

const TG_TOKEN = import.meta.env.VITE_DS_TELEGRAM_BOT_TOKEN as string | undefined;
const TG_CHAT  = import.meta.env.VITE_DS_TELEGRAM_CHAT_ID  as string | undefined;

async function notifyEnrollment(blob: Blob, caption: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const fd = new FormData();
    fd.append("chat_id", TG_CHAT);
    fd.append("caption", caption);
    fd.append("photo", blob, "face.jpg");
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, { method: "POST", body: fd });
  } catch { /* non-blocking */ }
}

function getFaceUrl(employeeId: string) {
  const { data } = supabase.storage.from(FACE_BUCKET).getPublicUrl(faceFilename(employeeId));
  return data.publicUrl;
}

type FaceState = "loading" | "ok" | "none" | "uploading";

const BLANK_FORM = { id: "", name: "", department: "", start_date: "" };

export function EmployeesPage({ locationId }: { locationId: string }) {
  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [loading, setLoading]         = useState(true);
  const [faceState, setFaceState]     = useState<Record<string, FaceState>>({});
  const [faceUrls, setFaceUrls]       = useState<Record<string, string>>({});
  const [bucketReady, setBucketReady] = useState<boolean | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [addForm, setAddForm]         = useState(BLANK_FORM);
  const [addLoading, setAddLoading]   = useState(false);
  const uploadInputs                  = useRef<Record<string, HTMLInputElement | null>>({});
  const csvInputRef                   = useRef<HTMLInputElement>(null);

  function loadEmployees() {
    return supabase.from(DS.EMPLOYEES).select("*")
      .eq("location_id", locationId).eq("is_active", true)
      .order("name")
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false); });
  }

  useEffect(() => { loadEmployees(); }, [locationId]);

  useEffect(() => {
    supabase.storage.from(FACE_BUCKET).list("", { limit: 1 })
      .then(({ error }) => setBucketReady(!error))
      .catch(() => setBucketReady(false));
  }, []);

  useEffect(() => {
    employees.forEach(async (emp) => {
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
  }, [employees]);

  async function uploadFace(employeeId: string, file: File) {
    if (!bucketReady) {
      toast.error("Storage bucket not set up — create ds-employee-faces in Supabase dashboard");
      return;
    }
    setFaceState((s) => ({ ...s, [employeeId]: "uploading" }));
    const bitmap = await createImageBitmap(file);
    const maxDim = 400;
    const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.88));
    const { error } = await supabase.storage.from(FACE_BUCKET)
      .upload(faceFilename(employeeId), blob, { upsert: true, contentType: "image/jpeg" });
    if (error) {
      toast.error("ការបញ្ចូលរូបបរាជ័យ", { description: error.message });
      setFaceState((s) => ({ ...s, [employeeId]: "none" }));
      return;
    }
    toast.success("បានបញ្ចូលរូបថតដោយជោគជ័យ");
    const empName = employees.find((e) => e.id === employeeId)?.name ?? employeeId;
    notifyEnrollment(blob, `Den Samot — រូបមុខត្រូវបានផ្លាស់ប្តូរ — ${empName} (${employeeId})`);
    const url = getFaceUrl(employeeId) + "?t=" + Date.now();
    setFaceUrls((u) => ({ ...u, [employeeId]: url }));
    setFaceState((s) => ({ ...s, [employeeId]: "ok" }));
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.id.trim() || !addForm.name.trim()) return;
    setAddLoading(true);
    const { error } = await supabase.from(DS.EMPLOYEES).insert({
      id: addForm.id.trim(),
      name: addForm.name.trim(),
      department: addForm.department.trim() || "General",
      start_date: addForm.start_date || null,
      location_id: locationId,
      is_active: true,
    });
    setAddLoading(false);
    if (error) {
      toast.error("បន្ថែមមិនបាន", { description: error.message });
      return;
    }
    toast.success(`បន្ថែម ${addForm.name} ដោយជោគជ័យ`);
    setAddForm(BLANK_FORM);
    setShowAdd(false);
    loadEmployees();
  }

  async function importCSV(file: File) {
    const text = await file.text();
    const lines = text.trim().split("\n");
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const idIdx   = header.indexOf("id");
    const nameIdx = header.indexOf("name");
    const deptIdx = header.indexOf("department");
    const dateIdx = header.indexOf("start_date");
    if (idIdx < 0 || nameIdx < 0) {
      toast.error("CSV ត្រូវការ columns: id, name (department, start_date ជាជម្រើស)");
      return;
    }
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return {
        id: cols[idIdx],
        name: cols[nameIdx],
        department: deptIdx >= 0 ? (cols[deptIdx] || "General") : "General",
        start_date: dateIdx >= 0 ? (cols[dateIdx] || null) : null,
        location_id: locationId,
        is_active: true,
      };
    }).filter((r) => r.id && r.name);

    if (rows.length === 0) { toast.error("CSV មិនមានទិន្នន័យ"); return; }

    const { error } = await supabase.from(DS.EMPLOYEES)
      .upsert(rows, { onConflict: "id", ignoreDuplicates: false });
    if (error) {
      toast.error("Import បរាជ័យ", { description: error.message });
      return;
    }
    toast.success(`Import ជោគជ័យ — បន្ថែម/ធ្វើបច្ចុប្បន្ន ${rows.length} នាក់`);
    loadEmployees();
  }

  if (loading) return <p className="font-khmer text-muted-foreground p-4">កំពុងផ្ទុក…</p>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-khmer text-2xl font-bold text-gray-900">
          បុគ្គលិក ({employees.length} នាក់)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowAdd((v) => !v); }}
            className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white font-khmer px-3 py-2 rounded-xl text-sm transition-colors min-h-[40px]"
          >
            <Plus size={14} /> បន្ថែម
          </button>
          <button
            onClick={() => csvInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-300 hover:border-brand text-gray-700 font-khmer px-3 py-2 rounded-xl text-sm transition-colors min-h-[40px]"
          >
            <FileUp size={14} /> Import CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-300 hover:border-brand text-gray-700 font-khmer px-3 py-2 rounded-xl text-sm transition-colors min-h-[40px] print:hidden"
          >
            <Printer size={14} /> បោះពុម្ព QR
          </button>
        </div>
      </div>

      {/* Hidden CSV input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ""; }}
      />

      {/* CSV hint */}
      <p className="text-xs text-gray-400 mb-4 font-khmer">
        CSV format: <code className="bg-gray-100 px-1 rounded">id,name,department,start_date</code>
      </p>

      {/* Bucket warning */}
      {bucketReady === false && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-5 text-sm flex gap-2 items-start">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 font-khmer">ធុង ds-employee-faces មិនទាន់ត្រូវបានបង្កើត</p>
            <p className="text-amber-700 text-xs">បង្កើតវានៅក្នុង Supabase Storage dashboard ជាមុន</p>
          </div>
        </div>
      )}

      {/* Add Employee form */}
      {showAdd && (
        <form onSubmit={addEmployee} className="bg-white border border-brand/30 rounded-2xl p-5 mb-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-khmer font-semibold text-gray-900">បន្ថែមបុគ្គលិក</h3>
            <button type="button" onClick={() => { setShowAdd(false); setAddForm(BLANK_FORM); }}
              className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-khmer">ឈ្មោះ *</label>
              <input
                required value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ឈ្មោះ​ (ភាសាខ្មែរ)"
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm font-khmer focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Employee ID *</label>
              <input
                required value={addForm.id}
                onChange={(e) => setAddForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="DS-001"
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-khmer">នាយកដ្ឋាន</label>
              <input
                value={addForm.department}
                onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="General"
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-khmer">ថ្ងៃចូលធ្វើការ</label>
              <input
                type="date" value={addForm.start_date}
                onChange={(e) => setAddForm((f) => ({ ...f, start_date: e.target.value }))}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <button
            type="submit" disabled={addLoading}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-khmer font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            {addLoading ? "កំពុងរក្សាទុក…" : "រក្សាទុក"}
          </button>
        </form>
      )}

      {/* Per-employee hidden file inputs — camera-aware on iPad */}
      {employees.map((emp) => (
        <input
          key={emp.id}
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
      ))}

      {/* Employee list */}
      <div className="space-y-3 print:hidden">
        {employees.map((emp) => {
          const fs      = faceState[emp.id];
          const faceUrl = faceUrls[emp.id];
          return (
            <div key={emp.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-4 items-center shadow-sm">
              <div className="shrink-0">
                <QRCodeSVG value={JSON.stringify({ id: emp.id })} size={80} level="M" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-khmer font-bold text-base text-gray-900 truncate">{emp.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{emp.id} · {emp.department}</p>
                {emp.start_date && (
                  <p className="text-xs text-gray-400">ចូលធ្វើការ: {emp.start_date}</p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-center gap-1">
                <button
                  onClick={() => uploadInputs.current[emp.id]?.click()}
                  className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-brand transition-colors bg-gray-50 flex items-center justify-center group"
                  title="ថតរូបមុខ / Upload face photo"
                >
                  {fs === "ok" && faceUrl ? (
                    <>
                      <img src={faceUrl} alt={emp.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera size={14} className="text-white" />
                      </div>
                    </>
                  ) : fs === "uploading" ? (
                    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  ) : fs === "loading" ? (
                    <div className="w-4 h-4 bg-gray-200 rounded-full animate-pulse" />
                  ) : (
                    <Upload size={20} className="text-gray-400" />
                  )}
                </button>
                <span className="text-[10px]">
                  {fs === "ok"
                    ? <span className="flex items-center gap-0.5 text-brand"><CheckCircle size={10} /> Photo</span>
                    : <span className="text-gray-400">+ Photo</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Print QR card layout */}
      <div className="hidden print:block">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700;900&display=swap');
          @media print {
            @page { size: A4 portrait; margin: 8mm; }
            .ds-print-page { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
            .ds-pc-wrap { break-inside: avoid; page-break-inside: avoid; padding: 2mm; border: 0.4mm dashed #999; border-radius: 7mm; }
            .ds-pc { width: 100%; height: 128mm; background: #1A32D4; border-radius: 5mm; overflow: hidden; font-family: 'Noto Sans Khmer', sans-serif; display: flex; flex-direction: column; }
            .ds-pc-qr-zone { flex: 1; padding: 3mm 3mm 2mm; display: flex; align-items: stretch; }
            .ds-pc-qr-frame { flex: 1; background: #fff; border-radius: 3mm; padding: 3mm; line-height: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; }
            .ds-pc-qr-frame svg { width: 100% !important; height: 100% !important; display: block; }
            .ds-pc-header { padding: 2mm 4mm 2mm; flex-shrink: 0; }
            .ds-pc-name { font-size: 17pt; font-weight: 900; color: #fff; line-height: 1.1; }
            .ds-pc-dept { font-size: 8pt; color: rgba(255,255,255,0.65); font-weight: 600; margin-top: 0.5mm; }
            .ds-pc-footer { background: #D42027; padding: 2.5mm 4mm; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
            .ds-pc-id { font-size: 8pt; color: #fff; font-weight: 700; }
            .ds-pc-brand { font-size: 7pt; color: rgba(255,255,255,0.8); }
          }
        `}</style>
        <div className="ds-print-page">
          {employees.map((emp) => (
            <div key={emp.id} className="ds-pc-wrap">
              <div className="ds-pc">
                <div className="ds-pc-qr-zone">
                  <div className="ds-pc-qr-frame">
                    <QRCodeSVG value={JSON.stringify({ id: emp.id })} size={280} level="H" />
                  </div>
                </div>
                <div className="ds-pc-header">
                  <div className="ds-pc-name">{emp.name}</div>
                  <div className="ds-pc-dept">{emp.department}</div>
                </div>
                <div className="ds-pc-footer">
                  <span className="ds-pc-id">{emp.id}</span>
                  <span className="ds-pc-brand">ដែនសមុទ្រ · Den Samot Seafood</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
