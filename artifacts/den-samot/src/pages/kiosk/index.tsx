import { useEffect, useRef, useState, useCallback } from "react";
import { Check, ArrowRight, Clock, AlertCircle, AlertTriangle, X } from "lucide-react";
import jsQR from "jsqr";
import { Human } from "@vladmandic/human";
import { createHuman, extractEmbedding, loadImageToCanvas, FACE_MATCH_THRESHOLD } from "../../lib/face";
import { getScanType, checkLate, SCAN_TYPE_LABEL_KH } from "../../lib/scan-logic";
import { supabase, getTodayDate, faceFilename, FACE_BUCKET, DS } from "../../lib/supabase";
import type { Employee, ScanType } from "../../lib/supabase";
import { composeReceipt, sendReceiptPhoto } from "../../lib/telegram";
import { VoiceRecorder } from "../../components/VoiceRecorder";

type Stage =
  | "idle"
  | "scanning"
  | "verifying"
  | "late_prompt"
  | "cheat_prompt"
  | "saving"
  | "success"
  | "already_done"
  | "error";

type ConfirmInfo = {
  employee: Employee;
  scanType: ScanType;
  scanId: string;
  isLate: boolean;
  lateMinutes: number;
  frameCanvas: HTMLCanvasElement;
  matchPct: number;
};

const LOCATION_ID  = localStorage.getItem("ds_location_id")  ?? "";
const LOCATION_NAME = localStorage.getItem("ds_location_name") ?? "";
const TG_CHAT_ID   = import.meta.env.VITE_DS_TELEGRAM_CHAT_ID as string | undefined;

let humanInstance: Human | null = null;

export function KioskPage() {
  const [stage, setStage]       = useState<Stage>("idle");
  const [errMsg, setErrMsg]     = useState("");
  const [confirm, setConfirm]   = useState<ConfirmInfo | null>(null);
  const [pendingScanId, setPendingScanId] = useState<string | null>(null);
  const [clock, setClock]       = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
  );

  useEffect(() => {
    const t = setInterval(() =>
      setClock(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }))
    , 15000);
    return () => clearInterval(t);
  }, []);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);

  // ── Voice done callbacks ─────────────────────────────────────────────────
  const onLateAudioDone = useCallback(async (audioUrl: string | null) => {
    if (!confirm || !pendingScanId) return;
    await finaliseScan(confirm, pendingScanId, audioUrl, false);
  }, [confirm, pendingScanId]);

  const onCheatAudioDone = useCallback(async (audioUrl: string | null) => {
    if (!confirm || !pendingScanId) return;
    await finaliseScan(confirm, pendingScanId, audioUrl, true);
  }, [confirm, pendingScanId]);

  // ── Camera ───────────────────────────────────────────────────────────────
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      showError("មិនអាចបើករ៉ូបង់ — សូមអំណោយ");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }

  // ── Scan loop ────────────────────────────────────────────────────────────
  function startLoop() {
    if (!humanInstance) { humanInstance = createHuman(); }
    humanInstance.load().then(() => { rafRef.current = requestAnimationFrame(loop); });
  }

  const loop = useCallback(async () => {
    if (processingRef.current || !videoRef.current || !canvasRef.current) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return; }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    // QR decode
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(imageData.data, imageData.width, imageData.height);
    if (!qr) { rafRef.current = requestAnimationFrame(loop); return; }

    let empId: string;
    try { empId = JSON.parse(qr.data).id; } catch {
      rafRef.current = requestAnimationFrame(loop); return;
    }
    if (!empId) { rafRef.current = requestAnimationFrame(loop); return; }

    processingRef.current = true;
    setStage("verifying");
    stopCamera();

    try {
      await processEmployee(empId, canvas);
    } catch (e) {
      showError((e as Error).message ?? "កំហុស");
    } finally {
      processingRef.current = false;
    }
  }, []);

  // ── Core logic ───────────────────────────────────────────────────────────
  async function processEmployee(empId: string, frameCanvas: HTMLCanvasElement) {
    // Load employee
    const { data: emp, error: empErr } = await supabase
      .from(DS.EMPLOYEES)
      .select("*")
      .eq("id", empId)
      .eq("location_id", LOCATION_ID)
      .eq("is_active", true)
      .single();
    if (empErr || !emp) { showError("មិនស្គាល់អ្នកនេះ — ID: " + empId); return; }

    // Face verify
    const faceUrl = supabase.storage.from(FACE_BUCKET).getPublicUrl(faceFilename(empId)).data.publicUrl;
    const faceCanvas = await loadImageToCanvas(faceUrl);
    if (!faceCanvas) { showError("រូបភាពមុខមិនទាន់ស្InputStream"); return; }

    const storedEmb  = await extractEmbedding(humanInstance!, faceCanvas);
    const liveEmb    = await extractEmbedding(humanInstance!, frameCanvas);
    if (!storedEmb || !liveEmb) { showError("ត្រួតពិនិត្យមុខបានបរាជ័យ — ព្យាយាមម្ដងទៀត"); return; }

    const sim = humanInstance!.match.similarity(storedEmb, liveEmb);
    if (sim < FACE_MATCH_THRESHOLD) { showError("មុខមិនត្រូវ — ព្យាយាមម្ដងទៀត"); return; }

    const matchPct = Math.round(sim * 100);
    const scanType = getScanType();
    const today    = getTodayDate();

    // Check duplicate
    const { data: existing } = await supabase
      .from(DS.SCANS)
      .select("id")
      .eq("employee_id", empId)
      .eq("date", today)
      .eq("scan_type", scanType)
      .single();
    if (existing) { setStage("already_done"); setTimeout(resetToIdle, 3000); return; }

    // Insert scan (placeholder — will update audio later)
    const { data: newScan, error: insertErr } = await supabase
      .from(DS.SCANS)
      .insert({
        employee_id: empId,
        location_id: LOCATION_ID,
        date: today,
        scan_type: scanType,
        scanned_at: new Date().toISOString(),
        is_late: false,
        missing_afternoon_in: false,
        verified: true,
      })
      .select("id")
      .single();
    if (insertErr || !newScan) { showError("រក្សាទុកបរាជ័យ — " + (insertErr?.message ?? "")); return; }

    const { late, lateMinutes } = checkLate(scanType, new Date(), emp.department);

    const info: ConfirmInfo = {
      employee: emp, scanType, scanId: newScan.id,
      isLate: late, lateMinutes, frameCanvas, matchPct,
    };
    setConfirm(info);
    setPendingScanId(newScan.id);

    // Cheat check on afternoon_out
    if (scanType === "afternoon_out") {
      const { data: afIn } = await supabase
        .from(DS.SCANS)
        .select("id")
        .eq("employee_id", empId)
        .eq("date", today)
        .eq("scan_type", "afternoon_in")
        .single();
      if (!afIn) {
        speak("ហេតុអ្វីអ្នកមិនបានស្គែននៅម៉ោង ២ រសៀល?");
        await supabase.from(DS.SCANS).update({ missing_afternoon_in: true }).eq("id", newScan.id);
        setStage("cheat_prompt");
        return;
      }
    }

    if (late) {
      speak("ហេតុអ្វីអ្នកមកធ្វើការយឺត?");
      setStage("late_prompt");
      return;
    }

    await finaliseScan(info, newScan.id, null, false);
  }

  // ── Finalise: update scan + receipt ─────────────────────────────────────
  async function finaliseScan(
    info: ConfirmInfo, scanId: string,
    audioUrl: string | null, hadCheat: boolean,
  ) {
    setStage("saving");
    const { isLate, lateMinutes } = info;

    await supabase.from(DS.SCANS).update({
      is_late: isLate,
      late_minutes: isLate ? lateMinutes : null,
      late_reason_audio_url: audioUrl,
    }).eq("id", scanId);

    // Build receipt
    const now = new Date();
    const timeStr = now.toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" });
    const receipt = composeReceipt(info.frameCanvas, {
      name: info.employee.name,
      id: info.employee.id,
      scanType: info.scanType,
      time: timeStr,
      match: info.matchPct,
      location: LOCATION_NAME,
      isLate: isLate,
    });

    if (TG_CHAT_ID) {
      const caption = `${isLate ? "⚠️ LATE — " : ""}${info.employee.name} | ${SCAN_TYPE_LABEL_KH[info.scanType]} | ${timeStr}${hadCheat ? "\n🚨 missing afternoon_in" : ""}`;
      await sendReceiptPhoto(receipt, caption, TG_CHAT_ID);
    }

    setStage("success");
    setTimeout(resetToIdle, 3000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function speak(text: string) {
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "km-KH"; utt.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(utt);
  }

  function showError(msg: string) {
    setErrMsg(msg);
    setStage("error");
    setTimeout(resetToIdle, 4000);
  }

  function resetToIdle() {
    stopCamera();
    setStage("idle");
    setConfirm(null);
    setPendingScanId(null);
    setErrMsg("");
    processingRef.current = false;
  }

  async function beginScan() {
    setStage("scanning");
    await startCamera();
    startLoop();
  }

  useEffect(() => () => stopCamera(), []);

  // ── Render ────────────────────────────────────────────────────────────────
  const emp = confirm?.employee;

  const bgStyle: React.CSSProperties = {
    background: "linear-gradient(145deg, #040B3D 0%, #0C1870 50%, #060D4A 100%)",
  };

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center overflow-hidden select-none relative" style={bgStyle}>
      {/* Ambient glow orbs — always present */}
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-brand/10 blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-ds-red/8 blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />

      {/* Always-mounted canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {stage === "idle" && (
        <button
          onClick={beginScan}
          className="flex flex-col items-center gap-8 active:scale-95 transition-transform duration-150"
        >
          {/* Logo with multi-ring pulse */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-72 h-72 rounded-full border border-ds-red/15 animate-ping" style={{ animationDuration: "4s" }} />
            <div className="absolute w-60 h-60 rounded-full border border-brand/20 animate-ping" style={{ animationDuration: "3s", animationDelay: "0.6s" }} />
            <div className="absolute w-52 h-52 rounded-full border border-ds-red/25 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "1.2s" }} />
            <div
              className="relative w-44 h-44 rounded-full border-4 border-ds-red p-2 animate-glow-pulse"
              style={{ background: "rgba(6,13,74,0.7)", backdropFilter: "blur(8px)" }}
            >
              <img src="/logo.png" alt="Den Samot" className="w-full h-full rounded-full object-cover" />
            </div>
          </div>

          {/* Clock */}
          <p className="text-5xl font-bold text-white tracking-widest tabular-nums">{clock}</p>

          <div className="text-center space-y-2">
            <p className="font-khmer text-4xl font-bold text-white">ចុចដើម្បីចាប់ផ្ដើម</p>
            <p className="font-khmer text-brand-light/70 text-lg">ស្គែន QR ប័ណ្ណបុគ្គលិក</p>
          </div>

          {/* Location badge */}
          <div
            className="px-6 py-2 rounded-full font-khmer text-sm text-ds-red/90"
            style={{ background: "rgba(212,32,39,0.12)", border: "1px solid rgba(212,32,39,0.3)" }}
          >
            {LOCATION_NAME}
          </div>
        </button>
      )}

      {/* ── SCANNING ─────────────────────────────────────────────────────── */}
      <div style={{ display: stage === "scanning" ? "flex" : "none" }}
        className="flex-col items-center gap-6 w-full max-w-sm px-4">
        <p className="font-khmer text-lg text-brand-light/80 tracking-wide">
          ដាក់ប័ណ្ណ QR នៅចន្លោះស៊ុម
        </p>
        <div className="relative w-72 h-72 rounded-2xl overflow-hidden bg-black"
          style={{ border: "2px solid rgba(26,50,212,0.6)", boxShadow: "0 0 30px rgba(26,50,212,0.2)" }}>
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          {/* Corner markers */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-3 left-3 w-10 h-10 border-l-4 border-t-4 border-brand rounded-tl-xl" />
            <div className="absolute top-3 right-3 w-10 h-10 border-r-4 border-t-4 border-brand rounded-tr-xl" />
            <div className="absolute bottom-3 left-3 w-10 h-10 border-l-4 border-b-4 border-brand rounded-bl-xl" />
            <div className="absolute bottom-3 right-3 w-10 h-10 border-r-4 border-b-4 border-brand rounded-br-xl" />
            {/* Scan line */}
            <div className="absolute left-4 right-4 h-0.5 animate-scan"
              style={{ background: "linear-gradient(90deg, transparent, rgba(26,50,212,0.9), transparent)" }} />
          </div>
        </div>
        <button onClick={resetToIdle}
          className="font-khmer text-brand-light/40 hover:text-brand-light/70 text-sm transition-colors mt-1">
          ចុចដើម្បីបោះបង់
        </button>
      </div>

      {/* ── VERIFYING ─────────────────────────────────────────────────────── */}
      {stage === "verifying" && (
        <div className="flex flex-col items-center gap-5 animate-fade-in-up">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-brand/20" />
            <div className="absolute inset-0 rounded-full border-4 border-brand border-t-transparent animate-spin" />
          </div>
          <p className="font-khmer text-xl text-brand-light">កំពុងត្រួតពិនិត្យ…</p>
        </div>
      )}

      {/* ── LATE PROMPT ──────────────────────────────────────────────────── */}
      {stage === "late_prompt" && emp && (
        <div className="flex flex-col items-center gap-5 px-8 max-w-sm text-center animate-fade-in-up">
          <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center">
            <Clock size={40} className="text-amber-400" />
          </div>
          <p className="font-khmer text-2xl font-bold text-amber-400">
            {emp.name}
          </p>
          <p className="font-khmer text-base text-white/80">
            មកយឺត <span className="text-amber-400 font-bold">{confirm?.lateMinutes} នាទី</span>
          </p>
          <p className="font-khmer text-xl text-white">ហេតុអ្វីអ្នកមកធ្វើការយឺត?</p>
          <VoiceRecorder employeeId={emp.id} scanId={pendingScanId!} onDone={onLateAudioDone} />
        </div>
      )}

      {/* ── CHEAT PROMPT ─────────────────────────────────────────────────── */}
      {stage === "cheat_prompt" && emp && (
        <div className="flex flex-col items-center gap-5 px-8 max-w-sm text-center animate-fade-in-up">
          <div className="w-20 h-20 rounded-full bg-ds-red/20 border-2 border-ds-red/50 flex items-center justify-center">
            <AlertCircle size={40} className="text-ds-red" />
          </div>
          <p className="font-khmer text-2xl font-bold text-white">{emp.name}</p>
          <p className="font-khmer text-xl text-white/90">
            ហេតុអ្វីអ្នកមិនបានស្គែននៅម៉ោង ២ រសៀល?
          </p>
          <VoiceRecorder employeeId={emp.id} scanId={pendingScanId!} onDone={onCheatAudioDone} />
        </div>
      )}

      {/* ── SAVING ───────────────────────────────────────────────────────── */}
      {stage === "saving" && (
        <div className="flex flex-col items-center gap-5 animate-fade-in-up">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-ds-gold/20" />
            <div className="absolute inset-0 rounded-full border-4 border-ds-gold border-t-transparent animate-spin" />
          </div>
          <p className="font-khmer text-xl text-ds-gold/80">កំពុងរក្សាទុក…</p>
        </div>
      )}

      {/* ── SUCCESS ──────────────────────────────────────────────────────── */}
      {stage === "success" && emp && confirm && (
        <div className="flex flex-col items-center gap-6 px-8 text-center animate-fade-in-up">
          <div
            className={`w-32 h-32 rounded-full flex items-center justify-center text-6xl font-bold animate-bounce-in shadow-2xl ${
              confirm.scanType.endsWith("_in")
                ? "bg-gradient-to-br from-emerald-400 to-green-600"
                : "bg-gradient-to-br from-brand to-brand-dark"
            }`}
            style={{
              boxShadow: confirm.scanType.endsWith("_in")
                ? "0 0 40px rgba(52,211,153,0.5)"
                : "0 0 40px rgba(26,50,212,0.5)",
            }}
          >
            {confirm.scanType.endsWith("_in")
              ? <Check size={56} strokeWidth={3} className="text-white" />
              : <ArrowRight size={56} strokeWidth={3} className="text-white" />}
          </div>

          <div className="space-y-2">
            <p className="text-3xl font-bold text-white">{emp.name}</p>
            <p className="font-khmer text-xl text-brand-light">{SCAN_TYPE_LABEL_KH[confirm.scanType]}</p>
            {confirm.isLate && (
              <p className="font-khmer text-amber-400 text-sm flex items-center justify-center gap-1">
                <AlertTriangle size={14} /> យឺត {confirm.lateMinutes} នាទី
              </p>
            )}
          </div>

          <p className="font-khmer text-white/30 text-sm">ត្រឡប់ក្នុង 3 វិនាទី…</p>
        </div>
      )}

      {/* ── ALREADY DONE ─────────────────────────────────────────────────── */}
      {stage === "already_done" && (
        <div className="flex flex-col items-center gap-6 px-8 text-center animate-fade-in-up">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold animate-bounce-in"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              boxShadow: "0 0 40px rgba(245,158,11,0.4)",
            }}
          >
            <Check size={52} strokeWidth={3} className="text-white" />
          </div>
          <p className="font-khmer text-2xl font-bold text-amber-300">បានស្គែនរួចហើយ</p>
          <p className="font-khmer text-white/40 text-sm">ត្រឡប់ក្នុង 3 វិនាទី…</p>
        </div>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────── */}
      {stage === "error" && (
        <div className="flex flex-col items-center gap-6 px-8 text-center animate-fade-in-up">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold animate-bounce-in"
            style={{
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              boxShadow: "0 0 40px rgba(220,38,38,0.4)",
            }}
          >
            <X size={52} strokeWidth={3} className="text-white" />
          </div>
          <p className="font-khmer text-xl text-red-300 max-w-xs">{errMsg}</p>
          <p className="font-khmer text-white/30 text-sm">ត្រឡប់ក្នុង 4 វិនាទី…</p>
        </div>
      )}
    </div>
  );
}
