/* Mask-only refinement. Never modifies photograph RGB or the original model output. */
(function(root){
function cleanMask(m, N) {
  const n = N * N, lab = new Int32Array(n), q = new Int32Array(n), on = i => m[i] > 127;
  const areas = [0]; let nl = 0;
  const grow = (i, test, id) => {
    let h = 0, t = 0, border = false; q[t++] = i; lab[i] = id;
    while (h < t) {
      const j = q[h++], x = j % N, y = (j / N) | 0;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) border = true;
      if (x > 0 && !lab[j - 1] && test(j - 1)) { lab[j - 1] = id; q[t++] = j - 1; }
      if (x < N - 1 && !lab[j + 1] && test(j + 1)) { lab[j + 1] = id; q[t++] = j + 1; }
      if (y > 0 && !lab[j - N] && test(j - N)) { lab[j - N] = id; q[t++] = j - N; }
      if (y < N - 1 && !lab[j + N] && test(j + N)) { lab[j + N] = id; q[t++] = j + N; }
    }
    return { a: t, border };
  };
  for (let i = 0; i < n; i++) if (!lab[i] && on(i)) areas.push(grow(i, on, ++nl).a);
  if (!nl) return m;
  const big = areas.reduce((max, area) => Math.max(max,area),0), K = new Uint8Array(n);
  const main = areas.indexOf(big);
  for (let i = 0; i < n; i++) if (lab[i] === main) K[i] = 1;
  lab.fill(0); let id = 0;
  for (let i = 0; i < n; i++) if (!K[i] && !lab[i]) {
    const r = grow(i, j => !K[j], ++id);
    if (!r.border && r.a <= Math.max(4, Math.round(n * 0.000015))) for (let k = 0; k < r.a; k++) K[q[k]] = 2;
  }
  // Keep only a narrow soft fringe near the connected subject, not distant hair fragments.
  const R = Math.max(2, Math.round(N / 256)), D1 = new Uint8Array(n), D2 = new Uint8Array(n), pre = new Int32Array(N + 1);
  for (let y = 0; y < N; y++) { const o = y * N; for (let x = 0; x < N; x++) pre[x + 1] = pre[x] + (K[o + x] ? 1 : 0); for (let x = 0; x < N; x++) D1[o + x] = pre[Math.min(N, x + R + 1)] - pre[Math.max(0, x - R)] > 0 ? 1 : 0; }
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) pre[y + 1] = pre[y] + D1[y * N + x]; for (let y = 0; y < N; y++) D2[y * N + x] = pre[Math.min(N, y + R + 1)] - pre[Math.max(0, y - R)] > 0 ? 1 : 0; }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = K[i] === 2 ? 255 : D2[i] ? m[i] : 0;
  return out;
}
function refineEdges(alpha, rgb, w, h) {
 if(alpha.length!==w*h || rgb.length!==w*h*4)throw new Error('Dimensões de máscara incompatíveis');
 const out=alpha.slice();
 // Joint bilateral filtering only at uncertain edges. Solid interior/background stay exact.
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x,a=alpha[i];if(a===0||a===255)continue;
  const c=i*4;let sum=0,weights=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const j=i+dy*w+dx,k=j*4,dr=rgb[c]-rgb[k],dg=rgb[c+1]-rgb[k+1],db=rgb[c+2]-rgb[k+2];
   const weight=(dx===0&&dy===0?4:dx===0||dy===0?2:1)/(1+(dr*dr+dg*dg+db*db)/600);
   sum+=alpha[j]*weight;weights+=weight;
  }
  out[i]=Math.round(sum/weights);
 }
 return out;
}
const api={cleanMask,refineEdges};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MaskRefinement=api;
})(typeof self!=='undefined'?self:globalThis);
