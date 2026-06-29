import { useRef, useState } from "react";
import { supabase, LATE_AUDIO_BUCKET, lateAudioPath } from "../lib/supabase";

type Props = {
  employeeId: string;
  scanId: string;
  onDone: (audioUrl: string | null) => void;
};

type State = "idle" | "recording" | "uploading" | "done" | "error";

export function VoiceRecorder({ employeeId, scanId, onDone }: Props) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        upload();
      };
      rec.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setState("error");
      onDone(null);
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recRef.current?.stop();
    setState("uploading");
  }

  async function upload() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const path = lateAudioPath(employeeId, scanId);
    const { error } = await supabase.storage.from(LATE_AUDIO_BUCKET).upload(path, blob, {
      contentType: "audio/webm", upsert: true,
    });
    if (error) { setState("error"); onDone(null); return; }
    const { data } = supabase.storage.from(LATE_AUDIO_BUCKET).getPublicUrl(path);
    setState("done");
    onDone(data.publicUrl);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {state === "idle" && (
        <button
          onClick={start}
          className="w-24 h-24 rounded-full bg-brand flex items-center justify-center text-white text-4xl shadow-lg active:scale-95 transition-transform"
        >
          🎤
        </button>
      )}

      {state === "recording" && (
        <>
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-red-500 animate-pulse-ring absolute inset-0" />
            <button
              onClick={stop}
              className="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center text-white text-4xl relative shadow-lg"
            >
              ⏹
            </button>
          </div>
          <p className="font-khmer text-lg text-red-600 font-semibold">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </p>
        </>
      )}

      {state === "uploading" && (
        <div className="w-24 h-24 rounded-full bg-brand-dark flex items-center justify-center text-white text-2xl animate-spin">
          ⏳
        </div>
      )}

      {state === "done" && (
        <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center text-white text-4xl">
          ✓
        </div>
      )}

      {state === "error" && (
        <div className="text-red-600 font-khmer text-center">
          <p className="text-4xl mb-2">⚠</p>
          <p>រកឃើញកំហុស — សូមព្យាយាមម្ដងទៀត</p>
        </div>
      )}
    </div>
  );
}
