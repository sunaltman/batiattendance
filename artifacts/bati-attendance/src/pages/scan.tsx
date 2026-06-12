import { useRef, useEffect, useState, useCallback } from "react";
import { Human } from "@vladmandic/human";
import jsQR from "jsqr";
import { Camera, FolderOpen, ArrowRight, ArrowLeft, CheckCheck, ScanFace, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EMPLOYEES } from "@/lib/employees";
import { getShift, getTodayDate } from "@/lib/utils";
import type { Employee } from "@/lib/supabase";

const TG_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string | undefined;
const TG_CHAT  = import.meta.env.VITE_TELEGRAM_CHAT_ID  as string | undefined;
const BUCKET   = "employee-faces";
const FACE_MATCH_THRESHOLD = 0.5; // minimum similarity (0..1) — higher = stricter

// @vladmandic/human — modern, maintained face detection/recognition
// (BlazeFace detector + FaceMesh alignment + FaceRes 1024-dim embeddings)
const human = new Human({
  modelBasePath: `${import.meta.env.BASE_URL.replace(/\/$/, "")}/human-models`,
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 1 },
    mesh: { enabled: true },
    iris: { enabled: false },
    emotion: { enabled: false },
    description: { enabled: true }, // FaceRes embeddings
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  filter: { enabled: false },
});

function faceFilename(employeeId: string) {
  return encodeURIComponent(employeeId).replace(/%/g, "_") + ".jpg";
}

// Returns true only if the photo was actually posted to the group.
// Attendance is NOT recorded unless this succeeds — the Telegram photo
// is the tamper-proof audit trail.
async function sendToTelegram(canvas: HTMLCanvasElement, caption: string): Promise<boolean> {
  if (!TG_TOKEN || !TG_CHAT) return false;
  try {
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
    const fd = new FormData();
    fd.append("chat_id", TG_CHAT); fd.append("caption", caption); fd.append("photo", blob, "scan.jpg");
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    return res.ok && json?.ok === true;
  } catch {
    return false;
  }
}

async function loadImageToCanvas(url: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = url + "?t=" + Date.now();
  });
}

async function extractEmbedding(canvas: HTMLCanvasElement): Promise<number[] | null> {
  const res = await human.detect(canvas);
  const emb = res.face[0]?.embedding;
  return emb && emb.length > 0 ? emb : null;
}

type ScanType = "check_in" | "check_out";
type CamState = "idle" | "starting" | "scanning" | "processing" | "done" | "complete" | "no_camera";

const SHIFT_KH = { morning: "ព្រឹក", afternoon: "រសៀល" };

export default function ScanPage() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const lockedRef  = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [camState, setCamState]   = useState<CamState>("idle");
  const [errorMsg, setErrorMsg]   = useState("");
  const [modelsReady, setModelsReady] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [faceLoadStatus, setFaceLoadStatus] = useState<"loading"|"done"|"error">("loading");
  // face recognition embeddings: employeeId → FaceRes 1024-dim embedding
  const descriptorsRef = useRef<Map<string, number[]>>(new Map());

  const [result, setResult] = useState<{
    employee: Employee; shift: "morning"|"afternoon"; scanType: ScanType; time: string;
  } | null>(null);
  const [completeInfo, setCompleteInfo] = useState<{ name: string; shift: string } | null>(null);

  // Load human models, then preload face embeddings for enrolled employees
  useEffect(() => {
    human.load().then(async () => {
      await human.warmup(); // first inference is slow — do it now, not on first scan
      setModelsReady(true);
      // Pre-compute embeddings for any employees who have photos
      const emps = EMPLOYEES as readonly { id: string }[];
      await Promise.all(emps.map(async (emp) => {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(faceFilename(emp.id));
        try {
          const res = await fetch(data.publicUrl, { method: "HEAD" });
          if (!res.ok) return;
        } catch { return; }
        const canvas = await loadImageToCanvas(data.publicUrl);
        if (!canvas) return;
        const emb = await extractEmbedding(canvas);
        if (emb) descriptorsRef.current.set(emp.id, emb);
      }));
      setEnrolledCount(descriptorsRef.current.size);
      setFaceLoadStatus("done");
    }).catch(() => setFaceLoadStatus("error"));
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const processFrame = useCallback(async (canvas: HTMLCanvasElement) => {
    if (lockedRef.current) return;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(imageData.data, imageData.width, imageData.height);
    if (!qr) return;

    lockedRef.current = true;
    setCamState("processing");
    cancelAnimationFrame(rafRef.current);

    // ── Parse QR ──
    let parsed: { id: string };
    try { parsed = JSON.parse(qr.data); if (!parsed.id) throw new Error(); }
    catch { setErrorMsg("QR មិនត្រឹមត្រូវ"); lockedRef.current = false; setCamState("idle"); return; }

    // ── Face verification ──
    if (modelsReady) {
      const storedEmb = descriptorsRef.current.get(parsed.id);
      if (storedEmb) {
        // Employee has enrolled face — verify it matches
        const liveEmb = await extractEmbedding(canvas);
        if (!liveEmb) {
          setErrorMsg("មុខមិនច្បាស់ — សូមឲ្យបុគ្គលិកបង្ហាញមុខ");
          lockedRef.current = false; setCamState("idle"); return;
        }

        const similarity = human.match.similarity(liveEmb, storedEmb);
        if (similarity < FACE_MATCH_THRESHOLD) {
          setErrorMsg(`មុខមិនត្រូវ (${(similarity * 100).toFixed(0)}% ត្រូវគ្នា) — សូមព្យាយាមម្តងទៀត`);
          lockedRef.current = false; setCamState("idle"); return;
        }
      } else {
        // No enrolled face — require a face to be present (deters unattended QR cards)
        const res = await human.detect(canvas);
        if (res.face.length === 0) {
          setErrorMsg("មុខមិនច្បាស់ — សូមឲ្យបុគ្គលិកបង្ហាញមុខ");
          lockedRef.current = false; setCamState("idle"); return;
        }
      }
    }

    // ── Lookup employee ──
    const { data: emp, error: empErr } = await supabase
      .from("employees").select("*").eq("id", parsed.id).eq("is_active", true).single();
    if (empErr || !emp) {
      setErrorMsg(`មិនរកឃើញបុគ្គលិក: ${parsed.id}`);
      lockedRef.current = false; setCamState("idle"); return;
    }

    // ── Record attendance ──
    const shift   = getShift();
    const today   = getTodayDate();
    const now     = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    const { data: existing } = await supabase
      .from("attendance_logs").select("id, checked_in_at, checked_out_at")
      .eq("employee_id", parsed.id).eq("date", today).eq("shift", shift).maybeSingle();

    let scanType: ScanType;
    if (!existing) scanType = "check_in";
    else if (!existing.checked_out_at) scanType = "check_out";
    else {
      setCompleteInfo({ name: emp.name, shift: SHIFT_KH[shift] });
      lockedRef.current = false; stopCamera(); setCamState("complete"); return;
    }

    // ── Telegram audit photo MUST post before attendance is recorded ──
    const posted = await sendToTelegram(canvas,
      `${emp.name} — ${scanType === "check_in" ? "ចូលធ្វើការ" : "ចេញពីការងារ"} | វេន${SHIFT_KH[shift]} | ${timeStr}`);
    if (!posted) {
      setErrorMsg("មិនអាចផ្ញើរូបទៅ Telegram — សូមពិនិត្យអ៊ីនធឺណិត រួចព្យាយាមម្តងទៀត");
      lockedRef.current = false; setCamState("idle"); return;
    }

    if (scanType === "check_in") {
      const { error } = await supabase.from("attendance_logs").insert({
        employee_id: parsed.id, date: today, shift,
        checked_in_at: now.toISOString(), checked_out_at: null, verified: true,
      });
      if (error) { setErrorMsg(error.message); lockedRef.current = false; setCamState("idle"); return; }
    } else {
      const { error } = await supabase.from("attendance_logs")
        .update({ checked_out_at: now.toISOString() }).eq("id", existing!.id);
      if (error) { setErrorMsg(error.message); lockedRef.current = false; setCamState("idle"); return; }
    }

    setResult({ employee: emp, shift, scanType, time: timeStr });
    lockedRef.current = false; stopCamera(); setCamState("done");
  }, [modelsReady, stopCamera]);

  const startCamera = useCallback(async () => {
    setErrorMsg("");
    lockedRef.current = false;
    setCamState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCamState("scanning");

      const canvas = canvasRef.current!;
      const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          canvas.getContext("2d")!.drawImage(video, 0, 0);
          processFrame(canvas);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCamState("idle");
      setErrorMsg("ការអនុញ្ញាតកាមេរ៉ាត្រូវបានបដិសេធ");
    }
  }, [processFrame]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const reset = useCallback(() => {
    setResult(null); setCompleteInfo(null); setErrorMsg("");
    stopCamera(); setCamState("idle");
  }, [stopCamera]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      lockedRef.current = false;
      setCamState("processing");
      await processFrame(canvas);
    };
    img.src = url;
  }, [processFrame]);

  // ── Success ──
  if (camState === "done" && result) {
    const isIn = result.scanType === "check_in";
    return (
      <div className={`fixed inset-0 ${isIn ? "bg-green-600" : "bg-blue-600"} flex flex-col items-center justify-center text-white p-8 text-center`}>
        <div className="mb-4">{isIn ? <ArrowRight size={72} strokeWidth={1.5} /> : <ArrowLeft size={72} strokeWidth={1.5} />}</div>
        <div className="text-4xl font-bold font-khmer mb-2">{result.employee.name}</div>
        <div className="text-lg font-khmer opacity-90 mb-1">{result.employee.department}</div>
        <div className="mt-4 bg-white/20 rounded-2xl px-8 py-4">
          <div className="text-lg font-khmer font-semibold">{isIn ? "ចូលធ្វើការ" : "ចេញពីការងារ"} · វេន{SHIFT_KH[result.shift]}</div>
          <div className="text-3xl font-bold mt-1">{result.time}</div>
        </div>
        <button onClick={reset} className="mt-10 bg-white text-gray-800 font-bold px-8 py-4 rounded-2xl text-xl min-h-[56px]">
          ស្កែនម្តងទៀត
        </button>
      </div>
    );
  }

  if (camState === "complete" && completeInfo) {
    return (
      <div className="fixed inset-0 bg-yellow-500 flex flex-col items-center justify-center text-white p-8 text-center">
        <div className="mb-6"><CheckCheck size={64} strokeWidth={1.5} /></div>
        <div className="text-2xl font-bold font-khmer mb-2">ស្កែនគ្រប់គ្រាន់ហើយ</div>
        <div className="text-xl font-khmer">{completeInfo.name} — វេន{completeInfo.shift}</div>
        <button onClick={reset} className="mt-10 bg-white text-yellow-700 font-bold px-8 py-4 rounded-2xl text-xl min-h-[56px]">
          ស្កែនម្តងទៀត
        </button>
      </div>
    );
  }

  // ── Idle (tap to start) ──
  if (camState === "idle") {
    return (
      <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center p-8 text-center">
        <canvas ref={canvasRef} className="hidden" />
        <div className="mb-10">
          <div className="text-white text-xl font-khmer font-bold mb-1">ស្កែន QR វត្តមាន</div>
          <div className="text-gray-400 text-sm font-khmer">
            {faceLoadStatus === "error"
              ? <span className="text-red-400">Face AI failed to load</span>
              : modelsReady
              ? <span className="flex items-center justify-center gap-1 text-green-400"><ShieldCheck size={14} /> Face AI · {enrolledCount} enrolled</span>
              : "Loading Face AI..."}
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-600/90 rounded-2xl p-4 text-white font-khmer text-sm mb-6 w-full max-w-sm text-center">
            {errorMsg}
          </div>
        )}

        <button onClick={startCamera}
          className="w-32 h-32 rounded-full bg-white shadow-2xl active:scale-95 transition-transform flex items-center justify-center mb-4">
          <Camera size={52} className="text-gray-700" strokeWidth={1.5} />
        </button>
        <div className="text-gray-500 text-sm font-khmer mb-10">ចុចដើម្បីចាប់ផ្ដើម</div>

        <label className="text-gray-500 text-sm font-khmer underline cursor-pointer min-h-[44px] flex items-center gap-2">
          <FolderOpen size={16} /><span>ឬជ្រើសរើសរូបភាព</span>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </div>
    );
  }

  // ── Live viewfinder ──
  return (
    <div className="fixed inset-0 bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute inset-0 flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 bg-gradient-to-b from-black/60 to-transparent">
          <div className="text-white font-khmer font-bold text-lg">ស្កែន QR វត្តមាន</div>
          {modelsReady && (
            <div className="text-green-400 text-xs bg-black/40 rounded-full px-2 py-1 flex items-center gap-1">
              <ShieldCheck size={12} /> Face AI ({enrolledCount})
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-64 h-64">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
            {camState === "scanning" && (
              <div className="absolute left-1 right-1 h-0.5 bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.8)] animate-[scan_2s_linear_infinite]" />
            )}
            {camState === "processing" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full" />
              </div>
            )}
          </div>
        </div>

        <div className="pb-24 px-6 bg-gradient-to-t from-black/70 to-transparent">
          <div className="text-center text-white/70 text-sm font-khmer mb-4">
            {camState === "starting" ? "កំពុងបើកកាមេរ៉ា..." :
             camState === "processing" ? "កំពុងដំណើរការ..." : "ស្កែន QR ដោយស្វ័យប្រវត្តិ"}
          </div>
          <label className="flex items-center justify-center gap-2 text-white/50 text-sm font-khmer cursor-pointer min-h-[44px]">
            <FolderOpen size={16} /><span className="underline">ជ្រើសរើសរូបភាពពីបណ្ណសារ</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>
    </div>
  );
}
