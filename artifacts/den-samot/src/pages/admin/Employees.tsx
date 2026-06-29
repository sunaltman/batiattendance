import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { CheckCircle, Upload, Camera } from "lucide-react";
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

export function EmployeesPage({ locationId }: { locationId: string }) {
  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [loading, setLoading]         = useState(true);
  const [faceState, setFaceState]     = useState<Record<string, FaceState>>({});
  const [faceUrls, setFaceUrls]       = useState<Record<string, string>>({});
  const [bucketReady, setBucketReady] = useState<boolean | null>(null);
  const uploadInputs                  = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    supabase.from(DS.EMPLOYEES).select("*")
      .eq("location_id", locationId).eq("is_active", true)
      .order("name")
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false); });
  }, [locationId]);

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

    // Resize to max 400px before upload (same as Bati)
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
    notifyEnrollment(blob, `📸 Den Samot — រូបមុខត្រូវបានផ្លាស់ប្តូរ — ${empName} (${employeeId})`);
    const url = getFaceUrl(employeeId) + "?t=" + Date.now();
    setFaceUrls((u) => ({ ...u, [employeeId]: url }));
    setFaceState((s) => ({ ...s, [employeeId]: "ok" }));
  }

  if (loading) return <p className="font-khmer text-muted-foreground p-4">កំពុងផ្ទុក…</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="font-khmer text-2xl font-bold text-gray-900">
          បុគ្គលិក ({employees.length} នាក់)
        </h2>
        <button
          onClick={() => window.print()}
          className="bg-brand hover:bg-brand-dark text-white font-khmer px-4 py-2 rounded-xl text-sm transition-colors min-h-[44px]"
        >
          🖨 បោះពុម្ភកាត QR
        </button>
      </div>

      {bucketReady === false && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-5 text-sm">
          <p className="font-bold text-amber-800 font-khmer mb-1">⚠️ ធុង ds-employee-faces មិនទាន់ត្រូវបានបង្កើត</p>
          <p className="text-amber-700 text-xs">បង្កើតវានៅក្នុង Supabase Storage dashboard ជាមុន</p>
        </div>
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

      <div className="space-y-3 print:hidden">
        {employees.map((emp) => {
          const fs      = faceState[emp.id];
          const faceUrl = faceUrls[emp.id];
          return (
            <div key={emp.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-4 items-center shadow-sm">
              {/* QR code */}
              <div className="shrink-0">
                <QRCodeSVG value={JSON.stringify({ id: emp.id })} size={80} level="M" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-khmer font-bold text-base text-gray-900 truncate">{emp.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{emp.id} · {emp.department}</p>
                {emp.start_date && (
                  <p className="text-xs text-gray-400">ចូលធ្វើការ: {emp.start_date}</p>
                )}
              </div>

              {/* Face photo circle — tap to open camera/gallery */}
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

      {/* ── Print QR card layout — Den Samot blue/red branding ── */}
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
