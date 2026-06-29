import { useEffect, useRef, useState, useCallback } from "react";
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

  return (
    <div className="min-h-screen bg-ds-dark text-white flex flex-col items-center justify-center overflow-hidden select-none">

      {/* Always-mounted — canvas hidden, video shown only when scanning */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── IDLE ─────────────────────────────────────────────────────────── */}
      {stage === "idle" && (
        <button
          onClick={beginScan}
          className="flex flex-col items-center gap-6 p-12 rounded-3xl active:scale-95 transition-transform"
        >
          <div className="relative">
            <div className="w-40 h-40 rounded-full bg-brand/20 absolute inset-0 animate-pulse-ring" />
            <div className="w-40 h-40 rounded-full bg-brand flex items-center justify-center text-7xl relative">
              📷
            </div>
          </div>
          <div className="text-center">
            <p className="font-khmer text-3xl text-white font-semibold">ចុចដើម្បីចាប់ផ្ដើម</p>
            <p className="font-khmer text-brand-light text-lg mt-2">ស្គែន QR ប័ណ្ណ</p>
          </div>
        </button>
      )}

      {/* ── SCANNING — video is always mounted, shown here via absolute overlay ── */}
      <div style={{ display: stage === "scanning" ? "flex" : "none" }}
        className="flex-col items-center gap-6 w-full max-w-sm px-4">
        <p className="font-khmer text-xl text-brand-light">
          ដាក់ប័ណ្ណ QR នៅចន្លោះស៊ុម
        </p>
        <div className="relative w-72 h-72 border-2 border-brand rounded-2xl overflow-hidden bg-black">
          <video
            ref={videoRef} autoPlay muted playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-2 left-2 w-8 h-8 border-l-4 border-t-4 border-brand rounded-tl-lg" />
            <div className="absolute top-2 right-2 w-8 h-8 border-r-4 border-t-4 border-brand rounded-tr-lg" />
            <div className="absolute bottom-2 left-2 w-8 h-8 border-l-4 border-b-4 border-brand rounded-bl-lg" />
            <div className="absolute bottom-2 right-2 w-8 h-8 border-r-4 border-b-4 border-brand rounded-br-lg" />
            <div className="absolute left-0 right-0 h-0.5 bg-brand/80 animate-[scan_2s_linear_infinite]" style={{ top: "50%" }} />
          </div>
        </div>
        <button onClick={resetToIdle} className="font-khmer text-brand-light/60 text-sm mt-2">
          ចុចដើម្បីបោះបង់
        </button>
      </div>

      {/* ── VERIFYING ─────────────────────────────────────────────────────── */}
      {stage === "verifying" && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full border-4 border-brand border-t-transparent animate-spin" />
          <p className="font-khmer text-xl text-brand-light">កំពុងត្រួតពិនិត្យ…</p>
        </div>
      )}

      {/* ── LATE PROMPT ──────────────────────────────────────────────────── */}
      {stage === "late_prompt" && emp && (
        <div className="flex flex-col items-center gap-4 px-8 max-w-sm text-center">
          <p className="text-5xl">⏰</p>
          <p className="font-khmer text-2xl font-semibold text-amber-400">
            {emp.name} — មកយឺត {confirm?.lateMinutes} នាទី
          </p>
          <p className="font-khmer text-xl text-white">ហេតុអ្វីអ្នកមកធ្វើការយឺត?</p>
          <VoiceRecorder
            employeeId={emp.id}
            scanId={pendingScanId!}
            onDone={onLateAudioDone}
          />
        </div>
      )}

      {/* ── CHEAT PROMPT ─────────────────────────────────────────────────── */}
      {stage === "cheat_prompt" && emp && (
        <div className="flex flex-col items-center gap-4 px-8 max-w-sm text-center">
          <p className="text-5xl">🚨</p>
          <p className="font-khmer text-2xl font-semibold text-orange-400">{emp.name}</p>
          <p className="font-khmer text-xl text-white">
            ហេតុអ្វីអ្នកមិនបានស្គែននៅម៉ោង ២ រសៀល?
          </p>
          <VoiceRecorder
            employeeId={emp.id}
            scanId={pendingScanId!}
            onDone={onCheatAudioDone}
          />
        </div>
      )}

      {/* ── SAVING ───────────────────────────────────────────────────────── */}
      {stage === "saving" && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full border-4 border-ds-gold border-t-transparent animate-spin" />
          <p className="font-khmer text-xl text-brand-light">កំពុងរក្សាទុក…</p>
        </div>
      )}

      {/* ── SUCCESS ──────────────────────────────────────────────────────── */}
      {stage === "success" && emp && confirm && (
        <div className="flex flex-col items-center gap-6 px-8 text-center">
          <div className={`w-28 h-28 rounded-full flex items-center justify-center text-5xl ${
            confirm.scanType.endsWith("_in") ? "bg-green-500" : "bg-blue-500"
          }`}>
            {confirm.scanType.endsWith("_in") ? "✓" : "→"}
          </div>
          <div>
            <p className="font-khmer text-3xl font-bold">{emp.name}</p>
            <p className="font-khmer text-xl text-brand-light mt-1">
              {SCAN_TYPE_LABEL_KH[confirm.scanType]}
            </p>
            {confirm.isLate && (
              <p className="font-khmer text-amber-400 mt-1">
                ⚠️ យឺត {confirm.lateMinutes} នាទី
              </p>
            )}
          </div>
          <p className="font-khmer text-brand-light/60 text-sm">
            ត្រឡប់ក្នុង 3 វិនាទី…
          </p>
        </div>
      )}

      {/* ── ALREADY DONE ─────────────────────────────────────────────────── */}
      {stage === "already_done" && (
        <div className="flex flex-col items-center gap-6 px-8 text-center">
          <div className="w-28 h-28 rounded-full bg-amber-500 flex items-center justify-center text-5xl">
            ✓
          </div>
          <p className="font-khmer text-2xl font-bold text-amber-300">
            បានស្គែនរួចហើយ
          </p>
          <p className="font-khmer text-brand-light">ត្រឡប់ក្នុង 3 វិនាទី…</p>
        </div>
      )}

      {/* ── ERROR ────────────────────────────────────────────────────────── */}
      {stage === "error" && (
        <div className="flex flex-col items-center gap-6 px-8 text-center">
          <div className="w-28 h-28 rounded-full bg-red-600 flex items-center justify-center text-5xl">
            ✗
          </div>
          <p className="font-khmer text-xl text-red-300">{errMsg}</p>
          <p className="font-khmer text-brand-light/60 text-sm">ត្រឡប់ក្នុង 4 វិនាទី…</p>
        </div>
      )}

      {/* Location footer */}
      <p className="absolute bottom-4 text-brand-light/40 text-xs font-khmer">
        {LOCATION_NAME}
      </p>
    </div>
  );
}
