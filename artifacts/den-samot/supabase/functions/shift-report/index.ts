// Supabase Edge Function — Den Samot Shift Reports
// Deploy:  supabase functions deploy shift-report
// Cron:    supabase functions deploy shift-report --cron "15 5,10 * * *"
//          (UTC 05:15 = ICT 12:15pm, UTC 10:15 = ICT 17:15)
//
// Secrets (set via Supabase dashboard or CLI):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TG_BOT_TOKEN

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TG_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;

// Cambodia is UTC+7; determine which shift just closed
function getShift(): "morning" | "afternoon" | null {
  const now = new Date();
  const ictHour = (now.getUTCHours() + 7) % 24;
  if (ictHour === 12) return "morning";
  if (ictHour === 17) return "afternoon";
  return null;
}

function todayICT(): string {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 7);
  return now.toISOString().split("T")[0];
}

async function sendText(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

Deno.serve(async () => {
  const shift = getShift();
  const date  = todayICT();

  // Allow manual trigger via GET with ?shift=morning|afternoon
  const url   = new URL(import.meta.url);
  const qShift = url.searchParams.get("shift") as "morning" | "afternoon" | null;
  const activeShift = qShift ?? shift;

  if (!activeShift) {
    return new Response("Not a report window", { status: 200 });
  }

  const scanTypes = activeShift === "morning"
    ? ["morning_in", "morning_out"]
    : ["afternoon_in", "afternoon_out"];

  const { data: locations } = await supabase.from("ds_locations").select("*");
  if (!locations?.length) return new Response("No locations", { status: 200 });

  for (const loc of locations) {
    if (!loc.telegram_chat_id) continue;

    const { data: employees } = await supabase.from("ds_employees")
      .select("id, name")
      .eq("location_id", loc.id)
      .eq("is_active", true);

    const { data: scans } = await supabase.from("ds_scans")
      .select("employee_id, scan_type, scanned_at, is_late, late_minutes")
      .eq("location_id", loc.id)
      .eq("date", date)
      .in("scan_type", scanTypes);

    const empMap = new Map((employees ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
    const scanSet = new Map<string, { time: string; isLate: boolean }>();
    for (const s of (scans ?? [])) {
      if (!scanSet.has(s.employee_id)) {
        scanSet.set(s.employee_id, {
          time: new Date(s.scanned_at).toLocaleTimeString("km-KH", { hour: "2-digit", minute: "2-digit" }),
          isLate: s.is_late,
        });
      }
    }

    const rows = (employees ?? []).map((e: { id: string; name: string }) => ({
      name: e.name,
      hasScan: scanSet.has(e.id),
      scanTime: scanSet.get(e.id)?.time,
      isLate: scanSet.get(e.id)?.isLate,
    }));

    const present = rows.filter((r: { hasScan: boolean }) => r.hasScan);
    const absent  = rows.filter((r: { hasScan: boolean }) => !r.hasScan);
    const late    = present.filter((r: { isLate?: boolean }) => r.isLate);

    const emoji   = activeShift === "morning" ? "🌅" : "🌆";
    const shiftKh = activeShift === "morning" ? "វេនព្រឹក" : "វេនរសៀល";

    let msg = `${emoji} <b>${shiftKh} — ${date}</b>\n<b>${loc.name}</b>\n\n`;
    msg += `✅ មកធ្វើការ: ${present.length} នាក់\n`;
    if (late.length)   msg += `⚠️ មកយឺត: ${late.length} នាក់\n`;
    msg += `❌ អវត្តមាន: ${absent.length} នាក់\n`;
    if (absent.length) {
      msg += `\n<b>អវត្តមាន:</b>\n`;
      absent.forEach((r: { name: string }) => { msg += `  • ${r.name}\n`; });
    }
    if (late.length) {
      msg += `\n<b>មកយឺត:</b>\n`;
      late.forEach((r: { name: string; scanTime?: string }) => { msg += `  • ${r.name} (${r.scanTime})\n`; });
    }

    await sendText(loc.telegram_chat_id, msg);
  }

  return new Response("Reports sent", { status: 200 });
});
