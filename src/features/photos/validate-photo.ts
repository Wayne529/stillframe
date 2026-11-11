export async function validatePhoto(file: File) {
  if (file.size > 50 * 1024 * 1024) throw Error('单张不能超过 50MB');
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = header[0] === 255 && header[1] === 216;
  const png = header[0] === 137 && String.fromCharCode(...header.slice(1, 4)) === 'PNG';
  const webp =
    String.fromCharCode(...header.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw Error('支持 JPG、PNG、WebP，请先转换 HEIC / RAW');
  const bytes = await file.arrayBuffer();
  const hash = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    : (await import('@noble/hashes/sha2.js')).sha256(new Uint8Array(bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}
