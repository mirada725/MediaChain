const MB = 1024 * 1024;

const RULES: { kind: string; exts: string[]; maxMB: number }[] = [
  { kind: "image", exts: ["jpg", "jpeg", "png", "webp", "gif"], maxMB: 20 },
  { kind: "audio", exts: ["mp3", "wav", "m4a", "flac"], maxMB: 50 },
  { kind: "PDF", exts: ["pdf"], maxMB: 25 },
];

export const ACCEPT = RULES.flatMap((r) => r.exts.map((e) => "." + e)).join(",");

export const SUPPORTED_NOTE =
  "Supported files: images (JPG, PNG, WebP, GIF), audio (MP3, WAV, M4A, FLAC) and PDF.";

/** Returns a plain-language problem message, or null if the file is fine. */
export function checkFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const rule = RULES.find((r) => r.exts.includes(ext));
  if (!rule) {
    return "This file type isn't supported. Please choose an image, an audio file or a PDF.";
  }
  if (file.size > rule.maxMB * MB) {
    return `This ${rule.kind} is too large. The limit for ${rule.kind} files is ${rule.maxMB} MB.`;
  }
  return null;
}