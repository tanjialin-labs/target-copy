export function dataUrlByteLength(value: string): number {
  const comma = value.indexOf(",");
  if (comma < 0) return 0;

  const metadata = value.slice(0, comma);
  const payload = value.slice(comma + 1);
  if (/;base64(?:;|$)/i.test(metadata)) {
    const normalized = payload.replace(/\s/g, "");
    const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
  }

  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).byteLength;
  } catch {
    return new TextEncoder().encode(payload).byteLength;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Blob could not be converted to a data URL"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Blob read failed"));
    reader.readAsDataURL(blob);
  });
}
