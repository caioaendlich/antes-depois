const {test} = require('node:test');
const assert = require('node:assert/strict');
const PM = require('../pair-match.js');

// rosto sintético: modelo 3D simples girado (yaw) e inclinado (pitch), projetado na foto
function shot(id, yaw, pitch = 0, scale = 1, lum = null) {
  const M = [[-1, 0, 0], [1, 0, 0], [0, 0.85, -0.9], [0, 1.9, -0.15]];
  const ry = yaw * Math.PI / 180, rx = pitch * Math.PI / 180;
  const pts = M.map(([x, y, z]) => {
    let X = x * Math.cos(ry) + z * Math.sin(ry), Z = -x * Math.sin(ry) + z * Math.cos(ry);
    let Y = y * Math.cos(rx) - Z * Math.sin(rx); Z = y * Math.sin(rx) + Z * Math.cos(rx);
    return { x: 0.5 + X * 0.05 * scale, y: 0.4 + Y * 0.05 * scale * 0.75, z: Z * 0.05 };
  });
  return { id, w: 3000, h: 4000, yaw, pyr: { pts, w: 3000, h: 4000 }, _lum: lum };
}

test('escolhe o depois com o mesmo giro e a mesma inclinação', () => {
  const A = [shot('a0', 2, 0), shot('a1', 34, 2)];
  const D = [shot('d0', 20, 0), shot('d1', 3, 1), shot('d2', 3, 14)];
  const r = PM.bestPair(A, D, 'Frente');
  assert.equal(r.best.a.id, 'a0'); assert.equal(r.best.d.id, 'd1');
});

test('respeita o ângulo pedido mesmo havendo par melhor em outro ângulo', () => {
  const A = [shot('a0', 0), shot('a1', 36)];
  const D = [shot('d0', 0), shot('d1', 41)];
  assert.equal(PM.bestPair(A, D, '45° D').best.a.id, 'a1');
  assert.equal(PM.bestPair(A, D, '45° D').best.d.id, 'd1');
  assert.equal(PM.bestPair(A, D, 'Frente').best.d.id, 'd0');
});

test('luz e enquadramento desempatam fotos de mesmo ângulo', () => {
  const A = [shot('a0', 0, 0, 1, 0.5)];
  const D = [shot('d0', 1, 0, 1.8, 0.2), shot('d1', 1, 0, 1.05, 0.52)];
  assert.equal(PM.bestPair(A, D).best.d.id, 'd1');
});

test('ignora fotos sem rosto detectado e informa quantas faltaram', () => {
  const A = [{ id: 'x', w: 10, h: 10, pyr: null }, shot('a0', 0)];
  const D = [shot('d0', 0)];
  const r = PM.bestPair(A, D);
  assert.equal(r.best.a.id, 'a0'); assert.equal(r.missing.A, 1);
  assert.equal(PM.bestPair([{ id: 'x' }], D).best, null);
});

// foto que o iOS invalidou: o recorte relê a cópia guardada no aparelho em vez de falhar
test('recorte relê a foto do armazenamento quando o arquivo original expirou', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
  const start = src.indexOf('async function durableBlob('), end = src.indexOf('function fileToCanvas(', start);
  const stale = { stale: true, arrayBuffer: async () => { throw new Error('NotReadableError'); } };
  const good = new Blob(['ok'], { type: 'image/jpeg' });
  const ctx = vm.createContext({ Blob,
    fileToCanvas: async f => { if (f.stale) throw new Error('Formato de foto não suportado'); return { from: await f.text() }; },
    DB: { get: async (st, id) => (st === 'shots' && id === 's1' ? { id, blob: good } : null) } });
  vm.runInContext(src.slice(start, end), ctx);
  const shot = { id: 's1', blob: stale }, it = { file: stale, shot };
  assert.deepEqual(await ctx.itemCanvas(it), { from: 'ok' });
  assert.notEqual(it.file, stale); assert.equal(shot.blob, it.file);
  await assert.rejects(ctx.itemCanvas({ file: stale }), /não abriu/);
  const copy = await ctx.durableBlob(good); assert.notEqual(copy, good); assert.equal(await copy.text(), 'ok'); assert.equal(copy.type, 'image/jpeg');
});

// geometria de um lado já como o Prisma desenha: âncora nos olhos, escala que deixa olhos-lábio = FACE_D
function side(col, yaw, w = 3000, h = 4000) {
  const sh = shot('x', yaw); const p = sh.pyr.pts.map(q => [q.x * w, q.y * h]);
  const eye = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], d = Math.hypot(p[3][0] - eye[0], p[3][1] - eye[1]);
  // contorno: as bochechas ficam 1,1 olhos-lábio para cada lado em frontal; de lado, a orelha fica atrás do olho
  const r = yaw * Math.PI / 180, cheek = (sgn) => [eye[0] + (sgn * 1.1 * Math.cos(r) + 0.9 * Math.sin(r) * 0) * d, eye[1] + 0.3 * d];
  return { ax: eye[0], ay: eye[1], oy: 826, k0: 178.2 / d, r0: 0, col, pts: [...p, cheek(-1), cheek(1)], eye, nose: p[2], yaw };
}
test('montagem automática: olhos na mesma altura, rostos do mesmo tamanho, centralizada, folga de frente e sobreposição de lado', () => {
  const fr = PM.autoLayout(side(291.6, 0), side(788.4, 2));
  assert.equal(fr.front, 'D'); assert.equal(fr.A.s, fr.D.s); assert.equal(fr.A.dy, 912 - 826);
  assert.ok(Math.abs(fr.gap - 0.25) < 0.05);
  const ob = PM.autoLayout(side(291.6, -55), side(788.4, -55));
  assert.ok(ob.gap < fr.gap - 0.2, 'virado sobrepõe mais que de frente: ' + ob.gap);
  assert.notEqual(ob.front, PM.autoLayout(side(291.6, 55), side(788.4, 55)).front);
});
