// Recorte em segundo plano: o modelo roda aqui para a tela nunca travar.
// 14/11/2026: modelo principal MODNet (Apache-2.0, feito para retrato: cabelo com transparência fina e roupa inteira).
// Se ele quase não achar pessoa (ex.: foto de corpo sem rosto), o modelo antigo (RMBG) recorta no lugar.
importScripts('ort.wasm.min.js');
ort.env.wasm.wasmPaths = self.location.href.replace(/[^/]*$/, '');
ort.env.wasm.numThreads = 1;
let modnet = null, rmbg = null, RES = 1024, rmbgSize = 0, rmbgChunks = 0;

async function loadRmbg() {
  if (rmbg) return rmbg;
  const buf = new Uint8Array(rmbgSize); let off = 0;
  for (let i = 0; i < rmbgChunks; i++) {
    const r = await fetch('m/' + i + '.wasm');
    if (!r.ok) throw new Error('Falha ao baixar o recorte (parte ' + (i + 1) + ').');
    const b = new Uint8Array(await r.arrayBuffer()); buf.set(b, off); off += b.length;
  }
  rmbg = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return rmbg;
}
function tensor(px, mean, std, scale) {
  const n = RES * RES, inp = new Float32Array(3 * n);
  for (let i = 0, j = 0; j < n; i += 4, j++)
    for (let c = 0; c < 3; c++) inp[j + c * n] = (px[i + c] / scale - mean) / std;
  return new ort.Tensor('float32', inp, [1, 3, RES, RES]);
}

onmessage = async e => {
  const d = e.data;
  try {
    if (d.type === 'load') {
      RES = d.res; rmbgSize = d.size; rmbgChunks = d.chunks;
      const r = await fetch('modnet.onnx');
      if (!r.ok) throw new Error('Falha ao baixar o recorte.');
      postMessage({ type: 'prog', p: 0.6 });
      modnet = await ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      postMessage({ type: 'ready', kind: 'modnet' });
    } else if (d.type === 'run') {
      const px = d.px;
      const out = await modnet.run({ input: tensor(px, 0.5, 0.5, 255) });
      let o = new Float32Array(out.output.data), kind = 'modnet', area = 0;
      for (let i = 0; i < o.length; i++) if (o[i] > 0.5) area++;
      if (area < o.length * 0.03) {       // quase nada de pessoa: usa o modelo antigo
        const s = await loadRmbg();
        const r2 = await s.run({ input: tensor(px, 128 / 256, 1, 256) });
        o = new Float32Array(r2.output.data); kind = 'rmbg';
      }
      postMessage({ type: 'out', id: d.id, data: o, kind }, [o.buffer]);
    }
  } catch (err) { postMessage({ type: 'err', id: d.id, msg: (err && err.message) || String(err) }); }
};
