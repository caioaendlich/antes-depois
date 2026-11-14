/* Escolha automática do par antes/depois mais compatível (Caio, 14/11/2026).
   Usa os quatro pontos do rosto que o Prisma já guarda em cada foto (exocantos, ponta do nariz, lábio inferior):
   o par bom tem o mesmo giro (yaw), a mesma inclinação para cima ou para baixo, enquadramento parecido e luz parecida. */
(function (root) {
  const POSE_YAW = { 'Frente': 0, '45° D': 35, '45° E': -35, 'Perfil D': 75, 'Perfil E': -75 };

  function features(s) {
    const pyr = s && s.pyr, p = pyr && pyr.pts;
    if (!p || p.length !== 4) return null;
    const w = pyr.w || s.w || 1, h = pyr.h || s.h || 1;
    const P = q => [q.x * w, q.y * h];
    const [a, b, n, l] = p.map(P);
    const e = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = Math.hypot(l[0] - e[0], l[1] - e[1]);
    if (!(d > 0)) return null;
    const u = [(l[0] - e[0]) / d, (l[1] - e[1]) / d], v = [-u[1], u[0]];
    const ne = [n[0] - e[0], n[1] - e[1]];
    const yaw = typeof s.yaw === 'number' && isFinite(s.yaw) ? s.yaw : (typeof p.yaw === 'number' ? p.yaw : null);
    return {
      yaw,
      nx: (ne[0] * v[0] + ne[1] * v[1]) / d,           // nariz para o lado: acompanha o giro
      ny: (ne[0] * u[0] + ne[1] * u[1]) / d,           // nariz mais alto ou mais baixo: inclinação da cabeça
      span: Math.hypot(b[0] - a[0], b[1] - a[1]) / d,  // distância entre os olhos sobre olhos-lábio
      roll: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI,
      size: d / Math.max(w, h),                        // tamanho do rosto na foto (distância da câmera)
      lum: typeof s._lum === 'number' ? s._lum : null
    };
  }

  function wrap180(x) { x = ((x + 180) % 360 + 360) % 360 - 180; return x; }

  // custo menor = par mais parecido. Cada termo vale ~1 quando a diferença já é visível na montagem.
  function cost(fa, fd) {
    const parts = {};
    parts.yaw = fa.yaw != null && fd.yaw != null ? Math.pow((fa.yaw - fd.yaw) / 6, 2) : Math.pow((fa.nx - fd.nx) / 0.08, 2);
    parts.pitch = Math.pow((fa.ny - fd.ny) / 0.07, 2);
    parts.span = 0.5 * Math.pow((fa.span - fd.span) / 0.12, 2);
    parts.roll = 0.15 * Math.pow(Math.max(0, Math.abs(wrap180(fa.roll - fd.roll)) - 4) / 6, 2); // o editor já endireita até 12°
    parts.size = 0.35 * Math.pow(Math.log(fa.size / fd.size) / 0.35, 2);
    parts.lum = fa.lum != null && fd.lum != null ? 0.35 * Math.pow((fa.lum - fd.lum) / 0.12, 2) : 0;
    let total = 0; for (const k in parts) total += parts[k];
    return { total, parts };
  }

  // A, D: listas de fotos (shots). pose: 'Frente', '45° D'... (opcional). Devolve o melhor par e o ranking.
  function bestPair(A, D, pose) {
    const fa = A.map(features), fd = D.map(features);
    const target = pose != null && POSE_YAW[pose] != null ? POSE_YAW[pose] : null;
    const ranked = [];
    for (let i = 0; i < A.length; i++) {
      if (!fa[i]) continue;
      for (let j = 0; j < D.length; j++) {
        if (!fd[j]) continue;
        const c = cost(fa[i], fd[j]);
        // fora do ângulo pedido pesa, mas não elimina: se só existir outro ângulo, ainda sai um par
        let off = 0;
        if (target != null) for (const f of [fa[i], fd[j]]) if (f.yaw != null) off += Math.pow(Math.max(0, Math.abs(f.yaw - target) - 15) / 10, 2);
        const yawDiff = fa[i].yaw != null && fd[j].yaw != null ? Math.abs(fa[i].yaw - fd[j].yaw) : null;
        ranked.push({ i, j, a: A[i], d: D[j], score: c.total + off, cost: c.total, parts: c.parts, yawDiff });
      }
    }
    ranked.sort((x, y) => x.score - y.score);
    return { best: ranked[0] || null, ranked, missing: { A: fa.filter(f => !f).length, D: fd.filter(f => !f).length } };
  }


  // Posição das duas cabeças, calibrada nas montagens que Caio fez à mão no Prisma (Video Studio, 06/11/2026):
  // - de frente: o contorno do rosto da frente começa logo depois da orelha do rosto de trás (orelha e brinco de trás
  //   continuam à mostra), folga de 0,37 da distância olhos-lábio entre os dois contornos;
  // - de lado (giro ~55°): o perfil do rosto da frente (ponta do nariz) entra 0,46 olhos-lábio sobre a bochecha do de trás,
  //   na frente da orelha, que fica escondida;
  // - fica na frente o rosto cujo nariz aponta para o outro (de frente: o depois);
  // - os dois juntos ocupam ~940 de 1080 px de largura, centralizados, olhos na mesma altura (y 755).
  // side: { ax, ay, oy, k0, r0, col, pts: [[x,y]...] contorno e pontos do rosto (px da foto), eye: [x,y], nose: [x,y], yaw }
  const LAYOUT = { W: 1080, eyeY: 755, span: 940, g0: 0.37, g1: -0.46, yawFull: 55, faceD: 0.165 * 1080, sMin: 0.6, sMax: 2.8 };
  function autoLayout(A, D, cfg) {
    const C = Object.assign({}, LAYOUT, cfg || {});
    const yaws = [A.yaw, D.yaw].filter(y => typeof y === 'number' && isFinite(y)).map(Math.abs);
    const yawAbs = yaws.length ? yaws.reduce((a, b) => a + b, 0) / yaws.length : 0;
    const dir = Math.sign(A.nose[0] - A.eye[0]) + Math.sign(D.nose[0] - D.eye[0]);
    const front = yawAbs < 12 || dir === 0 ? 'D' : dir < 0 ? 'D' : 'A';
    const g = C.g0 + (C.g1 - C.g0) * Math.min(1, yawAbs / C.yawFull);
    const xs = (side, s) => {
      const k = side.k0 * s, r = side.r0 * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
      return side.pts.map(([px, py]) => side.col + k * (c * (px - side.ax) - sn * (py - side.ay)));
    };
    const min = a => Math.min.apply(null, a), max = a => Math.max.apply(null, a);
    let s = 1, dxA = 0, dxD = 0;
    for (let pass = 0; pass < 6; pass++) {
      const d = C.faceD * s, xa = xs(A, s), xd = xs(D, s);
      // borda esquerda do depois = borda direita do antes + folga (negativa = sobreposição); vale para qualquer lado na frente
      dxD = max(xa) + g * d - min(xd);
      const L = Math.min(min(xa), min(xd) + dxD), R = Math.max(max(xa), max(xd) + dxD);
      const shift = C.W / 2 - (L + R) / 2; dxA = shift; dxD += shift;
      if (pass < 5) s = Math.max(C.sMin, Math.min(C.sMax, s * C.span / Math.max(1, R - L)));
    }
    return { A: { s, dx: dxA, dy: C.eyeY - A.oy, r: 0 }, D: { s, dx: dxD, dy: C.eyeY - D.oy, r: 0 }, front, gap: g };
  }

  function grade(cost) { return cost < 1.5 ? 'muito compatível' : cost < 5 ? 'compatível' : cost < 12 ? 'razoável' : 'pouco compatível'; }

  const api = { features, cost, bestPair, grade, autoLayout, LAYOUT, POSE_YAW };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PairMatch = api;
})(typeof self !== 'undefined' ? self : this);
