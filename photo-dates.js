/* Capture dates only. File modification time is intentionally never a fallback. */
(function(root) {
  function parseDate(value, subsecond = '', offset = '') {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value || '');
    if (!m) return null;
    const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
    const date = new Date(y, mo - 1, d, h, mi, s);
    if (y < 1900 || date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59 || s > 59) return null;
    const fraction = /^\d+$/.test(subsecond) ? subsecond : '';
    let time = date.getTime();
    if (/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)) {
      const sign = offset[0] === '+' ? 1 : -1;
      time = Date.UTC(y,mo-1,d,h,mi,s) - sign * (+offset.slice(1,3)*60 + +offset.slice(4))*60000;
    }
    return { capturedAt: time + Number(('0.' + (fraction || '0'))) * 1000, captureSubsecond: fraction, captureOffset: offset, captureDay: `${m[1]}-${m[2]}-${m[3]}`, captureSource: 'EXIF' };
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
          let nested = null, date = '', subsecond = '', offsetValue = '', focal35 = null, digitalZoom = null;
          for (let i = 0; i < count; i++) {
            const p = offset + 2 + i * 12, tag = u16(p), type = u16(p + 2), len = u32(p + 4);
            if (tag === 0x8769 && type === 4 && len === 1) nested = u32(p + 8);
            if (tag === 0xa405 && type === 3 && len === 1) focal35 = u16(p+8) || null;
            if (tag === 0xa404 && type === 5 && len === 1) {
              const start=u32(p+8);
              if(base+start+8<=n) { const denominator=u32(start+4); if(denominator) digitalZoom=u32(start)/denominator || null; }
            }
            if ([0x9003,0x9291,0x9011].includes(tag) && type === 2 && len > 0 && len <= 64) {
              const start = len <= 4 ? p + 8 : u32(p + 8);
              if (base + start + len <= n) {
                const value = new TextDecoder().decode(new Uint8Array(buffer, base + start, len)).replace(/\0.*$/s,'').trim();
                if (tag === 0x9003) date = value;
                else if (tag === 0x9291) subsecond = value;
                else offsetValue = value;
              }
            }
          }
          const child=nested ? ifd(nested, depth+1) : null;
          const result={...(parseDate(date,subsecond,offsetValue)||{}),...(child||{})};
          if(focal35) result.focal35=focal35;
          if(digitalZoom) result.digitalZoom=digitalZoom;
          return Object.keys(result).length ? result : null;
        }
        const found = ifd(u32(4), 0); if (found) return found;
      }
    } catch (_) { /* Unrecognized or stripped metadata: ask the user to classify. */ }
    return null;
  }
  function zoomGroup(s) {
    // Equivalent focal length already incorporates crop: do not multiply twice.
    if(Number.isFinite(s.focal35) && s.focal35>0) return s.focal35 < 40 ? 1 : s.focal35 <= 65 ? 2 : 3;
    if(Number.isFinite(s.digitalZoom) && s.digitalZoom>0) return s.digitalZoom < 1.6 ? 1 : s.digitalZoom < 2.6 ? 2 : 3;
    return 9;
  }
  function selectorCompare(a,b) {
    const angles=['Perfil E','45° E','Frente','45° D','Perfil D'];
    const rank=s=>{const i=angles.indexOf(s.pose);return i<0?9:i;};
    return rank(a)-rank(b) || zoomGroup(a)-zoomGroup(b) || compare(a,b);
  }
  function compare(a,b) {
    const ad = Number.isFinite(a.capturedAt), bd = Number.isFinite(b.capturedAt);
    if (ad !== bd) return ad ? -1 : 1;
    if (ad && a.capturedAt !== b.capturedAt) return a.capturedAt - b.capturedAt;
    const fraction=(a.captureSubsecond||'').padEnd(9,'0').localeCompare((b.captureSubsecond||'').padEnd(9,'0'));
    if(ad && fraction) return fraction;
    const an = a.originalName || a.name || '', bn = b.originalName || b.name || '';
    const names = an.localeCompare(bn, 'en', {numeric:true, sensitivity:'base'});
    return names || (a.t || 0) - (b.t || 0);
  }
  function sessions(shots) {
    const dated = shots.filter(s => Number.isFinite(s.capturedAt)).slice().sort((a,b) => a.capturedAt - b.capturedAt);
    const groups = [];
    for (const shot of dated) {
      const last = groups[groups.length - 1];
      if (!last || shot.capturedAt - last[last.length - 1].capturedAt > 30 * 60 * 1000) groups.push([shot]);
      else last.push(shot);
    }
    return {groups, unknown: shots.filter(s => !Number.isFinite(s.capturedAt))};
  }
  function split(shots) {
    const {groups, unknown} = sessions(shots), sides = new Map();
    if (groups.length === 2 && !unknown.length) groups.forEach((group,i) => group.forEach(s => sides.set(s.id, i ? 'D' : 'A')));
    return shots.map(s => ({id:s.id, side:sides.get(s.id) || 'U'}));
  }
  const api = { readExif, parseDate, sessions, split, compare, zoomGroup, selectorCompare };
  if (typeof module !== 'undefined') module.exports = api; else root.PhotoDates = api;
})(typeof window !== 'undefined' ? window : globalThis);
