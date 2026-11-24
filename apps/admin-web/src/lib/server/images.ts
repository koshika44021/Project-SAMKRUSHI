import 'server-only';
import { PHOTO_UPLOAD_RULES } from '@samkrushi/shared';
import sharp from 'sharp';

/**
 * Private image pipeline (master §13.9):
 *  - size limit and content sniffing (magic bytes), never the client MIME type,
 *  - re-encode to WebP (≤1600px), which drops EXIF/GPS metadata,
 *  - random object keys (never user filenames).
 */
export type ImageCheck = { ok: true; webp: Buffer } | { ok: false; message: string };

function sniff(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'webp';
  return null;
}

export async function processPrivateImage(
  file: File,
  maxBytes: number = PHOTO_UPLOAD_RULES.maxBytes,
): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, message: 'The selected file is empty.' };
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `The image must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`,
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniff(bytes)) return { ok: false, message: 'Upload a JPEG, PNG or WebP image.' };

  try {
    const webp = await sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate() // honour EXIF orientation before metadata is dropped
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    return { ok: false, message: 'The image could not be read. Try a different file.' };
  }
}

export function randomObjectKey(prefix: string): string {
  return `${prefix}/${crypto.randomUUID()}.webp`;
}
