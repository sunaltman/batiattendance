import { useRef, useEffect, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import jsQR from "jsqr";
import { supabase } from "@/lib/supabase";
import { getShift, getTodayDate } from "@/lib/utils";
import type { Employee } from "@/lib/supabase";

type ScanState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "processing" }
  | { status: "error"; message: string }
  | { status: "duplicate"; employee: Employee; shift: string }
  | { status: "success"; employee: Employee; shift: "morning" | "afternoon"; time: string };

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ status: "loading" });
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        await faceapi.nets.tinyFaceDetector.loadFromUri(`${base}/models`);
        setModelsLoaded(true);
      } catch {
        setScanState({ status: "error", message: "មិនអាចផ្ទុកម៉ូដែលរកមុខបាន — សូមពិនិត្យ /public/models/" });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanState({ status: "ready" });
      } catch {
        setScanState({ status: "error", message: "មិនអាចប្រើកាមេរ៉ាបាន — សូមអនុញ្ញាតការប្រើប្រាស់" });
      }
    }
    init();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return;
    setScanState({ status: "processing" });

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const [detections, qrResult] = await Promise.all([
      faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions()),
      Promise.resolve(jsQR(imageData.data, imageData.width, imageData.height)),
    ]);

    if (detections.length === 0) {
      setScanState({
        status: "error",
        message: "មុខមិនច្បាស់ — សូមឲ្យបុគ្គលិកប្រើ QR ជិតមុខ",
      });
      return;
    }

    if (!qrResult) {
      setScanState({
        status: "error",
        message: "មិនអាចស្កែន QR បាន — សូមប្រើកាតច្បាស់",
      });
      return;
    }

    let parsed: { id: string; name?: string; department?: string };
    try {
      parsed = JSON.parse(qrResult.data);
      if (!parsed.id) throw new Error("missing id");
    } catch {
      setScanState({ status: "error", message: "QR មិនត្រឹមត្រូវ — ទិន្នន័យខូច" });
      return;
    }

    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("*")
      .eq("id", parsed.id)
      .eq("is_active", true)
      .single();

    if (empErr || !emp) {
      setScanState({ status: "error", message: `មិនរកឃើញបុគ្គលិក: ${parsed.id}` });
      return;
    }

    const shift = getShift();
    const today = getTodayDate();

    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id")
      .eq("employee_id", parsed.id)
      .eq("date", today)
      .eq("shift", shift)
      .maybeSingle();

    if (existing) {
      setScanState({
        status: "duplicate",
        employee: emp,
        shift: shift === "morning" ? "ព្រឹក" : "រសៀល",
      });
      return;
    }

    const now = new Date();
    const { error: insertErr } = await supabase.from("attendance_logs").insert({
      employee_id: parsed.id,
      date: today,
      shift,
      checked_in_at: now.toISOString(),
      verified: true,
    });

    if (insertErr) {
      setScanState({ status: "error", message: `មានបញ្ហា: ${insertErr.message}` });
      return;
    }

    setScanState({
      status: "success",
      employee: emp,
      shift,
      time: now.toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" }),
    });
  }, [modelsLoaded]);

  const reset = () => setScanState({ status: "ready" });

  if (scanState.status === "success") {
    const shiftLabel = scanState.shift === "morning" ? "ព្រឹក" : "រសៀល";
    return (
      <div className="fixed inset-0 bg-green-600 flex flex-col items-center justify-center text-white p-8 text-center">
        <div className="text-6xl mb-6">✓</div>
        <div className="text-4xl font-bold font-khmer mb-3">{scanState.employee.name}</div>
        <div className="text-xl font-khmer mb-2">{scanState.employee.department}</div>
        <div className="text-2xl font-khmer mb-2">វេន{shiftLabel}</div>
        <div className="text-xl">{scanState.time}</div>
        <button
          onClick={reset}
          className="mt-10 bg-white text-green-700 font-bold px-8 py-4 rounded-2xl text-xl min-h-[56px]"
        >
          ស្កែនម្តងទៀត
        </button>
      </div>
    );
  }

  if (scanState.status === "duplicate") {
    return (
      <div className="fixed inset-0 bg-yellow-500 flex flex-col items-center justify-center text-white p-8 text-center">
        <div className="text-6xl mb-6">⚠</div>
        <div className="text-2xl font-bold font-khmer mb-2">
          បានកត់វត្តមានហើយ
        </div>
        <div className="text-xl font-khmer">
          {scanState.employee.name} វេន{scanState.shift}
        </div>
        <button
          onClick={reset}
          className="mt-10 bg-white text-yellow-700 font-bold px-8 py-4 rounded-2xl text-xl min-h-[56px]"
        >
          ស្កែនម្តងទៀត
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />

      {scanState.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-white text-xl font-khmer text-center px-6">
            <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
            កំពុងផ្ទុក...
          </div>
        </div>
      )}

      {scanState.status === "error" && (
        <div className="absolute top-6 left-4 right-4 bg-red-600 rounded-2xl p-4 text-white text-center font-khmer text-lg">
          {scanState.message}
        </div>
      )}

      {scanState.status === "processing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="animate-spin w-16 h-16 border-4 border-white border-t-transparent rounded-full" />
        </div>
      )}

      {(scanState.status === "ready" || scanState.status === "error") && (
        <div className="absolute inset-0 flex items-end justify-center pb-16">
          <button
            onClick={capture}
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 shadow-xl active:scale-95 transition-transform"
            aria-label="ថតរូប"
          />
        </div>
      )}

      <div className="absolute top-4 left-0 right-0 flex justify-center">
        <span className="bg-black/40 text-white font-khmer px-4 py-2 rounded-full text-sm">
          ចង្អុលកាមេរ៉ាទៅបុគ្គលិក ➜ ចុចថតរូប
        </span>
      </div>
    </div>
  );
}
