import type { ScanType } from "./supabase";
import { SCAN_TYPE_LABEL_KH } from "./scan-logic";

const TG_TOKEN = import.meta.env.VITE_DS_TELEGRAM_BOT_TOKEN as string | undefined;

// ── Receipt canvas ─────────────────────────────────────────────────────────

const RC = {
  bg: "#F0FAFB", ink: "#0A2F35", faint: "#4A7E8A",
  teal: "#1A7B8A", tealDeep: "#0D4550", tint: "#D8F0F4",
  dash: "rgba(10,47,53,.25)", gold: "#F2A62D",
};
const KH_FONT  = '"Noto Sans Khmer","Khmer OS",-apple-system,sans-serif';
const MONO_FONT = '"SF Mono","Roboto Mono",Menlo,monospace';

function dashedLine(ctx: CanvasRenderingContext2D, y: number, x1: number, x2: number) {
  ctx.save();
  ctx.strokeStyle = RC.dash; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  ctx.restore();
}

function row(
  ctx: CanvasRenderingContext2D, y: number, pad: number, w: number,
  label: string, value: string, verified = false,
) {
  ctx.textBaseline = "middle";
  ctx.fillStyle = RC.faint; ctx.font = `500 21px ${MONO_FONT}`; ctx.textAlign = "left";
  ctx.fillText(label, pad, y);
  ctx.textAlign = "right";
  if (verified) {
    ctx.font = `700 25px ${MONO_FONT}`;
    const tw = ctx.measureText(value).width;
    const cx = w - pad - tw - 22, r = 12;
    ctx.fillStyle = RC.teal;
    ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx - 4.5, y); ctx.lineTo(cx - 1.5, y + 3.5); ctx.lineTo(cx + 5, y - 4); ctx.stroke();
    ctx.fillStyle = RC.tealDeep; ctx.fillText(value, w - pad, y);
  } else {
    ctx.fillStyle = RC.ink; ctx.font = `700 25px ${KH_FONT}`;
    ctx.fillText(value, w - pad, y);
  }
}

export function composeReceipt(
  photo: HTMLCanvasElement,
  info: {
    name: string; id: string; scanType: ScanType;
    time: string; match: number | null; location: string;
    isLate: boolean;
  },
): HTMLCanvasElement {
  const W = 720, H = 1050, PAD = 48;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = RC.bg; ctx.fillRect(0, 0, W, H);

  // header
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = RC.ink; ctx.font = `700 38px Georgia,"Times New Roman",serif`;
  ctx.fillText("DEN SAMOT ATTENDANCE", W / 2, 68);
  ctx.fillStyle = RC.faint; ctx.font = `500 17px ${MONO_FONT}`;
  const typeLabel = SCAN_TYPE_LABEL_KH[info.scanType].toUpperCase().replace("(", "").replace(")", "");
  ctx.fillText(`V E R I F I E D   ${typeLabel}`, W / 2, 108);
  if (info.isLate) {
    ctx.fillStyle = "#D97706"; ctx.font = `700 17px ${MONO_FONT}`;
    ctx.fillText("⚠  LATE  ⚠", W / 2, 134);
  }
  dashedLine(ctx, 158, PAD, W - PAD);

  row(ctx, 202, PAD, W, "EMPLOYEE", info.name);
  row(ctx, 258, PAD, W, "ID", info.id);
  row(ctx, 314, PAD, W, "LOCATION", info.location);

  // photo
  const px = PAD, py = 358, pw = W - PAD * 2, ph = 340, r = 16;
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, r); else ctx.rect(px, py, pw, ph);
  ctx.clip();
  const ar = pw / ph;
  let sw = photo.width, sh = photo.height;
  if (sw / sh > ar) sw = sh * ar; else sh = sw / ar;
  ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
  ctx.restore();
  ctx.strokeStyle = RC.tealDeep; ctx.lineWidth = 4.5; ctx.lineCap = "round";
  const B = 28, G = 12;
  const corners: [number, number, number, number][] = [
    [px + G, py + G, 1, 1], [px + pw - G, py + G, -1, 1],
    [px + G, py + ph - G, 1, -1], [px + pw - G, py + ph - G, -1, -1],
  ];
  corners.forEach(([x, y, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * B); ctx.lineTo(x, y); ctx.lineTo(x + dx * B, y);
    ctx.stroke();
  });

  // bottom rows
  let y = 750;
  row(ctx, y, PAD, W, "FACE MATCH", info.match !== null ? `${info.match}% confirmed` : "—", info.match !== null);
  row(ctx, y += 56, PAD, W, "TIME", info.time);
  row(ctx, y += 56, PAD, W, "SCAN TYPE", SCAN_TYPE_LABEL_KH[info.scanType]);
  row(ctx, y += 56, PAD, W, "POSTED TO TELEGRAM", info.time, true);

  dashedLine(ctx, y + 44, PAD, W - PAD);
  ctx.textAlign = "center"; ctx.fillStyle = RC.faint; ctx.font = `500 16px ${MONO_FONT}`;
  ctx.fillText("RECORD IS IMMUTABLE AFTER POSTING", W / 2, y + 82);
  return c;
}

// ── Send to Telegram ──────────────────────────────────────────────────────

export async function sendReceiptPhoto(
  canvas: HTMLCanvasElement,
  caption: string,
  chatId: string,
): Promise<boolean> {
  if (!TG_TOKEN || !chatId) return false;
  try {
    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", 0.85),
    );
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", caption);
    fd.append("photo", blob, "scan.jpg");
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, {
      method: "POST", body: fd,
    });
    const json = await res.json().catch(() => null);
    return res.ok && json?.ok === true;
  } catch {
    return false;
  }
}

export async function sendTextMessage(text: string, chatId: string): Promise<boolean> {
  if (!TG_TOKEN || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Shift report text (called from admin or Edge Function) ────────────────

type ShiftSummaryRow = {
  name: string;
  hasScan: boolean;
  scanTime?: string;
  isLate?: boolean;
};

export function buildShiftReportText(
  locationName: string,
  date: string,
  shift: "morning" | "afternoon",
  rows: ShiftSummaryRow[],
): string {
  const emoji = shift === "morning" ? "🌅" : "🌆";
  const shiftKh = shift === "morning" ? "វេនព្រឹក" : "វេនរសៀល";
  const present = rows.filter((r) => r.hasScan);
  const absent  = rows.filter((r) => !r.hasScan);
  const late    = present.filter((r) => r.isLate);

  let msg = `${emoji} <b>${shiftKh} — ${date}</b>\n`;
  msg += `<b>${locationName}</b>\n\n`;
  msg += `✅ មកធ្វើការ: ${present.length} នាក់\n`;
  if (late.length > 0) msg += `⚠️ មកយឺត: ${late.length} នាក់\n`;
  msg += `❌ អវត្តមាន: ${absent.length} នាក់\n`;

  if (absent.length > 0) {
    msg += `\n<b>អវត្តមាន:</b>\n`;
    absent.forEach((r) => { msg += `  • ${r.name}\n`; });
  }
  if (late.length > 0) {
    msg += `\n<b>មកយឺត:</b>\n`;
    late.forEach((r) => { msg += `  • ${r.name} (${r.scanTime})\n`; });
  }
  return msg;
}
