import { AURI_EXPRESSIONS, AURI_FACE_FEATURES, AURI_MOOD_EXPRESSIONS, AURI_MOODS, type AuriExpression, type AuriMood } from "@/components/AuriFace";

type ArtworkFormat = "svg" | "png";

const styleProperties = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "visibility",
  "display",
  "transform",
  "transform-origin",
  "transform-box",
] as const;

function serializeVisibleFace(): string {
  const source = document.querySelector<SVGSVGElement>(".auri-companion-stage .auri-face__art");
  if (!source) throw new Error("Open Auri's expression preview before exporting the image.");

  const clone = source.cloneNode(true) as SVGSVGElement;
  const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))];
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sourceElements.forEach((element, index) => {
    const target = clonedElements[index];
    if (!(target instanceof SVGElement)) return;
    const computed = getComputedStyle(element);
    for (const property of styleProperties) {
      if ((element.classList.contains("auri-face__character") || element.classList.contains("auri-face__propeller")) && property === "transform") continue;
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
  });

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1200");
  clone.setAttribute("height", "1200");
  clone.setAttribute("role", "img");
  clone.setAttribute("aria-label", "Auri, AURA-X goal companion");
  return new XMLSerializer().serializeToString(clone);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadAuriArtwork(format: ArtworkFormat, mood: AuriMood, expression: AuriExpression) {
  const svgText = serializeVisibleFace();
  const base = `auri-${mood}-${expression}`;
  if (format === "svg") {
    downloadBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), `${base}.svg`);
    return;
  }

  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Auri's image could not be prepared for PNG export."));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot export the Auri image as PNG.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Auri's PNG could not be created.")), "image/png");
    });
    downloadBlob(png, `${base}.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function downloadAuriPresetBackup(mood: AuriMood, expression: AuriExpression) {
  const backup = {
    schemaVersion: 2,
    name: "AURA-X Auri mascot presets",
    exportedAt: new Date().toISOString(),
    currentPreview: { mood, expression },
    motions: AURI_MOODS.map(motion => ({ name: motion, expression: AURI_MOOD_EXPRESSIONS[motion] })),
    expressions: AURI_EXPRESSIONS.map(name => ({ name, features: AURI_FACE_FEATURES[name] })),
    moodToExpression: AURI_MOOD_EXPRESSIONS,
    faceFeatures: AURI_FACE_FEATURES,
  };
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }), "aura-x-auri-presets.json");
}
