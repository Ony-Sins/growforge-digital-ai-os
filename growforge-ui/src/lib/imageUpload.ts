/** Sniffs an uploaded buffer's real file signature and confirms it actually
 *  matches the extension the route is about to save it under. `file.type`
 *  (the multipart Content-Type header) is entirely client-supplied and
 *  trivially spoofable — trusting it alone lets someone upload arbitrary
 *  content (e.g. an SVG/HTML polyglot) that gets served back as a
 *  same-origin static asset under public/uploads/. Checking the magic
 *  bytes closes that gap without needing an image-processing dependency. */
export function matchesImageSignature(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 12) return false;

  switch (ext) {
    case "png":
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "jpg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "gif":
      return buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a";
    case "webp":
      return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}
