export interface ImageCandidate { url: string; descriptor: string }

export function parseSrcset(value: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index]!)) index += 1;
    const start = index;
    while (index < value.length && !/\s/.test(value[index]!)) index += 1;
    let url = value.slice(start, index);
    if (!url) break;
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
      candidates.push({ url, descriptor: "" });
      continue;
    }
    const descriptorStart = index;
    while (index < value.length && value[index] !== ",") index += 1;
    const descriptor = value.slice(descriptorStart, index).trim();
    if (!/^data:/i.test(url) && url.includes(",")) {
      const parts = url.split(",");
      candidates.push(...parts.slice(0, -1).filter(Boolean).map((part) => ({ url: part, descriptor: "" })));
      url = parts.at(-1)!;
    }
    if (url) candidates.push({ url, descriptor });
    index += 1;
  }
  return candidates;
}

export function serializeSrcset(candidates: ImageCandidate[]): string {
  return candidates.map(({ url, descriptor }) => `${url}${descriptor ? ` ${descriptor}` : ""}`).join(", ");
}
