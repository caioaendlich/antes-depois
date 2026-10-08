/* Capture dates only. File modification time is intentionally never a fallback. */
(function(root) {
  function parseDate(value) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value || '');
    if (!m) return null;
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    const date = new Date(y, mo - 1, d, h, mi, s);
    if (y < 1900 || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59 || s > 59) return null;
    return { capturedAt: date.getTime(), captureDay: `${m[1]}-${m[2]}-${m[3]}`, captureSource: 'EXIF' };
  }
  function readExif(buffer) {
    try {
      const v = new DataView(buffer), n = v.byteLength;
      // JPEG APP1, TIFF, PNG eXIf and WebP EXIF all contain a TIFF header.
      // Scan only the metadata prefix; validate the header and bounded offsets.
      const limit = Math.min(n - 8, 1024 * 1024);
      for (let base = 0; base <= limit; base++) {
        const le = v.getUint32(base, false) === 0x49492a00;
        if (!le && v.getUint32(base, false) !== 0x4d4d002a) continue;
        const u16 = p => v.getUint16(base + p, le), u32 = p => v.getUint32(base + p, le);
        const visited = new Set();
        function ifd(offset, depth) {
          if (depth > 2 || visited.has(offset) || offset < 8 || base + offset + 2 > n) return null;
          visited.add(offset);
          const count = u16(offset);
          if (count > 1024 || base + offset + 2 + count * 12 > n) return null;
          let nested = null, result = null;
          for (let i = 0; i < count; i++) {
            const p = offset + 2 + i * 12, tag = u16(p), type = u16(p + 2), len = u32(p + 4);
            if (tag === 0x8769 && type === 4 && len === 1) nested = u32(p + 8);
            if (tag === 0x9003 && type === 2 && len >= 19 && len <= 64) {
              const start = u32(p + 8);
              if (base + start + len <= n) result = parseDate(new TextDecoder().decode(new Uint8Array(buffer, base + start, len)));
            }
          }
          return result || (nested ? ifd(nested, depth + 1) : null);
        }
        const found = ifd(u32(4), 0); if (found) return found;
      }
    } catch (_) { /* Unrecognized or stripped metadata: ask the user to classify. */ }
    return null;
  }
  function split(shots) {
    const days = [...new Set(shots.map(s => s.captureDay).filter(Boolean))].sort();
    // Exactly two capture days are unambiguous. Never assign missing dates.
    return shots.map(s => ({ id: s.id, side: days.length === 2 && s.captureDay ? (s.captureDay === days[0] ? 'A' : 'D') : 'U' }));
  }
  const api = { readExif, parseDate, split };
  if (typeof module !== 'undefined') module.exports = api; else root.PhotoDates = api;
})(typeof window !== 'undefined' ? window : globalThis);
