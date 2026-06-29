import { Human } from "@vladmandic/human";

export const FACE_MATCH_THRESHOLD = 0.5;

export function createHuman(): Human {
  return new Human({
    modelBasePath: `${import.meta.env.BASE_URL.replace(/\/$/, "")}/human-models`,
    face: {
      enabled: true,
      detector: { rotation: true, maxDetected: 1 },
      mesh: { enabled: true },
      iris: { enabled: false },
      emotion: { enabled: false },
      description: { enabled: true },
      antispoof: { enabled: false },
      liveness: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    gesture: { enabled: false },
    filter: { enabled: false },
  });
}

export async function extractEmbedding(
  h: Human,
  canvas: HTMLCanvasElement,
): Promise<number[] | null> {
  const res = await h.detect(canvas);
  const emb = res.face[0]?.embedding;
  return emb && emb.length > 0 ? emb : null;
}

export async function loadImageToCanvas(url: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = url + "?t=" + Date.now();
  });
}
