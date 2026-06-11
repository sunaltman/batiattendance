import { useRef, useEffect, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import jsQR from "jsqr";
import { supabase } from "@/lib/supabase";
import { getShift, getTodayDate } from "@/lib/utils";
import type { Employee } from "@/lib/supabase";

const TG_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string | undefined;
const TG_CHAT  = import.meta.env.VITE_TELEGRAM_CHAT_ID  as string | undefined;

async function sendToTelegram(canvas: HTMLCanvasElement, caption: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
    const fd = new FormData();
    fd.append("chat_id", TG_CHAT);
    fd.append("caption", caption);
    fd.append("photo", blob, "scan.jpg");
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, { method: "POST", body: fd });
  } catch { /* fire-and-forget */ }
}

type ScanType = "check_in" | "check_out";

type ScanState =
  | { status: "idle" }
  | { status: "preview"; dataUrl: string }
  | { status: "processing" }
  | { status: "error"; message: string }
  | { status: "done"; employee: Employee; shift: "morning" | "afternoon"; scanType: ScanType; time: string }
  | { status: "complete"; employee: Employee; shift: string };

const SHIFT_KH = { morning: "ព្រឹក", afternoon: "រសៀល" };

export default function ScanPage() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanState, setScanState]     = useState<ScanState>({ status: "idle" });
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);

  // Load face models silently in background — camera works without them
  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    faceapi.nets.tinyFaceDetector.loadFromUri(`${base}/models`)
      .then(() => setModelsLoaded(true))
      .catch(() => {});
  }, []);

  const processCanvas = useCallback(async (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Run QR decode (always) + face check (only if models loaded)
    const [detections, qrResult] = await Promise.all([
      modelsLoaded
        ? faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions())
        : Promise.resolve([{ score: 1 }] as any[]), // skip if no model
      Promise.resolve(jsQR(imageData.data, imageData.width, imageData.height)),
    ]);

    if (modelsLoaded && detections.length === 0) {
      setScanState({ status: "error", message: "មុខមិនច្បាស់ — សូមឲ្យបុគ្គលិកកាន់ QR ជិតមុខ" });
      return;
    }
    if (!qrResult) {
      setScanState({ status: "error", message: "រកមិនឃើញ QR — សូមថតឱ្យច្បាស់ជាងនេះ" });
      return;
    }

    let parsed: { id: string };
    try {
      parsed = JSON.parse(qrResult.data);
      if (!parsed.id) throw new Error();
    } catch {
      setScanState({ status: "error", message: "QR មិនត្រឹមត្រូវ" }); return;
    }

    const { data: emp, error: empErr } = await supabase
      .from("employees").select("*").eq("id", parsed.id).eq("is_active", true).single();
    if (empErr || !emp) {
      setScanState({ status: "error", message: `មិនរកឃើញបុគ្គលិក: ${parsed.id}` }); return;
    }

    const shift = getShift();
    const today = getTodayDate();
    const now   = new Date();
    const timeStr = now.toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" });

    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id, checked_in_at, checked_out_at")
      .eq("employee_id", parsed.id).eq("date", today).eq("shift", shift)
      .maybeSingle();

    let scanType: ScanType;

    if (!existing) {
      const { error } = await supabase.from("attendance_logs").insert({
        employee_id: parsed.id, date: today, shift,
        checked_in_at: now.toISOString(), checked_out_at: null, verified: true,
      });
      if (error) { setScanState({ status: "error", message: error.message }); return; }
      scanType = "check_in";
    } else if (!existing.checked_out_at) {
      const { error } = await supabase
        .from("attendance_logs").update({ checked_out_at: now.toISOString() }).eq("id", existing.id);
      if (error) { setScanState({ status: "error", message: error.message }); return; }
      scanType = "check_out";
    } else {
      setScanState({ status: "complete", employee: emp, shift: SHIFT_KH[shift] }); return;
    }

    const label = scanType === "check_in" ? "ចូលធ្វើការ" : "ចេញពីការងារ";
    sendToTelegram(canvas, `${emp.name} — ${label} | វេន${SHIFT_KH[shift]} | ${timeStr}`);
    setScanState({ status: "done", employee: emp, shift, scanType, time: timeStr });
  }, [modelsLoaded]);

  // Called when user picks/takes a photo via file input
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setScanState({ status: "preview", dataUrl: url });
  }, []);

  // Process the previewed image
  const processPreview = useCallback(() => {
    if (!previewUrl || !canvasRef.current) return;
    setScanState({ status: "processing" });
    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(previewUrl);
      await processCanvas(canvas);
    };
    img.src = previewUrl;
  }, [previewUrl, processCanvas]);

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setScanState({ status: "idle" });
  };

  // ── Success ──
  if (scanState.status === "done") {
    const isIn = scanState.scanType === "check_in";
    return (
      <div className={`fixed inset-0 ${isIn ? "bg-green-600" : "bg-blue-600"} flex flex-col items-center justify-center text-white p-8 text-center`}>
        <div className="text-7xl mb-4 font-bold">{isIn ? "→" : "←"}</div>
        <div className="text-4xl font-bold font-khmer mb-2">{scanState.employee.name}</div>
        <div className="text-lg font-khmer mb-1 opacity-90">{scanState.employee.department}</div>
        <div className="mt-4 bg-white/20 rounded-2xl px-8 py-4">
          <div className="text-lg font-khmer font-semibold">{isIn ? "ចូលធ្វើការ" : "ចេញពីការងារ"} · វេន{SHIFT_KH[scanState.shift]}</div>
          <div className="text-3xl font-bold mt-1">{scanState.time}</div>
        </div>
        <button onClick={reset} className="mt-10 bg-white text-gray-800 font-bold px-8 py-4 rounded-2xl text-xl min-h-[56px]">
          ស្កែនម្តងទៀត
        </button>
      </div>
    );
  }

  if (scanState.status === "complete") {
    return (
      <div className="fixed inset-0 bg-yellow-500 flex flex-col items-center justify-center text-white p-8 text-center">
        <div className="text-6xl mb-6">✓✓</div>
        <div className="text-2xl font-bold font-khmer mb-2">ស្កែនគ្រប់គ្រាន់ហើយ</div>
        <div className="text-xl font-khmer">{scanState.complete?.employee?.name ?? ""} — វេន{scanState.complete?.shift ?? ""}</div>
        <button onClick={reset} className="mt-10 bg-white text-yellow-700 font-bold px-8 py-4 rounded-2xl text-xl min-h-[56px]">
          ស្កែនម្តងទៀត
        </button>
      </div>
    );
  }

  // ── Preview ──
  if (scanState.status === "preview") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col">
        <div className="flex-1 relative overflow-hidden">
          <img src={scanState.dataUrl} alt="preview" className="w-full h-full object-contain" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="bg-black p-4 pb-safe flex gap-3">
          <button onClick={reset} className="flex-1 py-4 rounded-2xl bg-gray-700 text-white font-khmer font-semibold text-base min-h-[56px]">
            ថតឡើងវិញ
          </button>
          <button onClick={processPreview} className="flex-2 flex-[2] py-4 rounded-2xl bg-white text-black font-khmer font-bold text-base min-h-[56px]">
            ប្រើរូបនេះ →
          </button>
        </div>
      </div>
    );
  }

  // ── Processing ──
  if (scanState.status === "processing") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
        <canvas ref={canvasRef} className="hidden" />
        <div className="animate-spin w-16 h-16 border-4 border-white border-t-transparent rounded-full mb-6" />
        <div className="text-white text-lg font-khmer">កំពុងដំណើរការ...</div>
      </div>
    );
  }

  // ── Idle / Error ──
  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8">
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input — capture="environment" opens back camera on iOS, no permission prompt */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="text-center mb-10">
        <div className="text-6xl mb-4">📷</div>
        <div className="text-white text-xl font-khmer font-bold">ស្កែន QR វត្តមាន</div>
        <div className="text-gray-400 text-sm font-khmer mt-2">ថតបុគ្គលិកជាមួយកាត QR</div>
        {modelsLoaded && (
          <div className="text-green-400 text-xs mt-1">✓ Face AI រួចរាល់</div>
        )}
      </div>

      {scanState.status === "error" && (
        <div className="bg-red-600 rounded-2xl p-4 text-white text-center font-khmer text-base mb-6 w-full max-w-sm">
          {scanState.message}
        </div>
      )}

      {/* Main camera button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-28 h-28 rounded-full bg-white shadow-2xl active:scale-95 transition-transform flex items-center justify-center mb-6"
        aria-label="ថតរូប"
      >
        <div className="w-24 h-24 rounded-full bg-white border-4 border-gray-200 flex items-center justify-center">
          <span className="text-4xl">📷</span>
        </div>
      </button>

      <div className="text-gray-500 text-sm font-khmer">ចុចដើម្បីថតរូប</div>

      {/* Upload from gallery fallback */}
      <label className="mt-6 text-gray-500 text-sm font-khmer underline cursor-pointer min-h-[44px] flex items-center">
        ឬជ្រើសរើសរូបពីបណ្ណសារ
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>
    </div>
  );
}
