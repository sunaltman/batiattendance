import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, FACE_BUCKET, faceFilename, DS } from "../../lib/supabase";
import type { Employee } from "../../lib/supabase";

export function EmployeesPage({ locationId }: { locationId: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from(DS.EMPLOYEES).select("*")
      .eq("location_id", locationId).eq("is_active", true)
      .order("name")
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false); });
  }, [locationId]);

  async function enrollFace(emp: Employee) {
    setEnrolling(emp.id);
    fileRef.current?.click();
    // The actual upload happens in handleFile
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !enrolling) return;
    const { error } = await supabase.storage.from(FACE_BUCKET).upload(
      faceFilename(enrolling), file, { contentType: file.type, upsert: true },
    );
    if (error) alert("Upload failed: " + error.message);
    else alert("Face photo uploaded!");
    setEnrolling(null);
    e.target.value = "";
  }

  function printQR(emp: Employee) {
    const w = window.open("", "_blank")!;
    const svg = document.getElementById(`qr-${emp.id}`)?.innerHTML ?? "";
    w.document.write(`
      <!DOCTYPE html><html><head><title>QR — ${emp.name}</title>
      <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}
      svg{width:200px;height:200px}p{margin:6px 0;font-size:14px;font-weight:600}</style></head>
      <body><div>${svg}</div><p>${emp.name}</p><p style="color:#999;font-size:11px">${emp.id}</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  if (loading) return <p className="font-khmer text-muted-foreground">កំពុងផ្ទុក…</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="font-khmer text-2xl font-bold mb-6">បុគ្គលិក</h2>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      <div className="space-y-3">
        {employees.map((emp) => (
          <div key={emp.id} className="bg-card border rounded-2xl p-4 flex items-center gap-4">
            <div id={`qr-${emp.id}`} className="shrink-0">
              <QRCodeSVG value={JSON.stringify({ id: emp.id })} size={80} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-khmer font-semibold truncate">{emp.name}</p>
              <p className="text-xs text-muted-foreground">{emp.department} · {emp.id}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => enrollFace(emp)}
                className="text-xs bg-brand text-white px-3 py-1.5 rounded-lg font-khmer hover:bg-brand-dark transition-colors"
              >
                📸 មុខ
              </button>
              <button
                onClick={() => printQR(emp)}
                className="text-xs bg-muted px-3 py-1.5 rounded-lg font-khmer hover:bg-muted/80 transition-colors"
              >
                🖨 QR
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
