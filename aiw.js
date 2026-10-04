// Recorte em segundo plano: o modelo roda aqui para a tela nunca travar
importScripts('ort.wasm.min.js');
ort.env.wasm.wasmPaths = self.location.href.replace(/[^/]*$/, '');
ort.env.wasm.numThreads = 1;
let sess = null, RES = 1024;
onmessage = async e => {
  const d = e.data;
  try {
    if (d.type === 'load') {
      RES = d.res;
      const buf = new Uint8Array(d.size); let off = 0;
      for (let i = 0; i < d.chunks; i++) {
        const r = await fetch('m/' + i + '.wasm');
        if (!r.ok) throw new Error('Falha ao baixar o recorte (parte ' + (i + 1) + ').');
        const b = new Uint8Array(await r.arrayBuffer()); buf.set(b, off); off += b.length;
        postMessage({ type: 'prog', p: (i + 1) / d.chunks });
      }
      sess = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      postMessage({ type: 'ready' });
    } else if (d.type === 'run') {
      const out = await sess.run({ input: new ort.Tensor('float32', d.inp, [1, 3, RES, RES]) });
      const o = new Float32Array(out.output.data);
      postMessage({ type: 'out', id: d.id, data: o }, [o.buffer]);
    }
  } catch (err) { postMessage({ type: 'err', id: d.id, msg: (err && err.message) || String(err) }); }
};
