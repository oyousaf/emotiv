/** Minimal Bodymovin-style exports for importer tests (25 fps, 1920x1080). */

const kf = (t: number, s: number[], extra: Record<string, unknown> = {}) => ({ t, s, i: { x: [0.2], y: [1] }, o: { x: [0.8], y: [0] }, ...extra });
const still = (k: unknown) => ({ a: 0, k });

function textLayer(ind: number, nm: string, ip: number, op: number, extra: Record<string, unknown> = {}) {
  return {
    ty: 5,
    ind,
    nm,
    ip,
    op,
    st: 0,
    ks: {
      o: { a: 1, k: [kf(op - 10, [100]), kf(op, [0])] },
      p: { a: 1, k: [kf(ip, [960, 740, 0]), kf(ip + 10, [960, 540, 0])] },
      a: still([0, 0, 0]),
      s: still([100, 100, 100]),
      r: still(0),
    },
    t: { d: { k: [{ t: 0, s: { s: 120, f: "Anton-Regular", t: "MAKE IT\rMOVE", j: 2, tr: 50, lh: 132, fc: [1, 0.18, 0.53] } }] }, a: [] },
    ...extra,
  };
}

export function simpleLottie() {
  return {
    v: "5.12.1",
    fr: 25,
    ip: 0,
    op: 125,
    w: 1920,
    h: 1080,
    nm: "Promo",
    ddd: 0,
    fonts: { list: [{ fName: "Anton-Regular", fFamily: "Anton", fStyle: "Regular", ascent: 70 }] },
    assets: [],
    layers: [
      textLayer(1, "Headline", 0, 125),
      {
        ty: 4,
        ind: 2,
        nm: "Accent bar",
        ip: 0,
        op: 125,
        st: 0,
        sr: 1,
        ao: 0,
        ddd: 0,
        ks: { o: still(100), p: still([960, 800, 0]), a: still([0, 0, 0]), s: { a: 1, k: [kf(5, [0, 100, 100]), kf(15, [100, 100, 100])] }, r: still(0) },
        shapes: [{ ty: "gr", nm: "Group", np: 3, it: [{ ty: "rc", d: 1, s: still([400, 12]), p: still([0, 0]), r: still(6), nm: "Rect" }, { ty: "fl", c: still([0, 0.9, 1, 1]), o: still(100), r: 1, nm: "Fill" }, { ty: "tr", p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0), nm: "Transform" }] }],
      },
      {
        ty: 4,
        ind: 3,
        nm: "Swirl",
        ip: 0,
        op: 125,
        st: 0,
        sr: 1,
        ao: 0,
        ddd: 0,
        ks: { o: still(100), p: still([960, 540, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]), r: { a: 1, k: [kf(0, [0]), kf(125, [360])] } },
        shapes: [{ ty: "gr", nm: "Group", np: 3, it: [{ ty: "sh", d: 1, nm: "Path", ks: still({ c: true, v: [[0, 0], [100, 0], [50, 80]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]] }) }, { ty: "st", c: still([1, 1, 1, 1]), o: still(100), w: still(4), lc: 2, lj: 2, nm: "Stroke" }, { ty: "tr", p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0), nm: "Transform" }] }],
      },
      { ty: 1, ind: 4, nm: "BG", ip: 0, op: 125, st: 0, sc: "#12062b", sw: 1920, sh: 1080, ks: { o: still(100), p: still([960, 540, 0]), a: still([960, 540, 0]), s: still([100, 100, 100]), r: still(0) } },
    ],
  };
}

/** A master comp made of two sequenced precomps that overlap by 10 frames. */
export function sequencedLottie() {
  const pre = (id: string, title: string) => ({ id, w: 1920, h: 1080, layers: [textLayer(1, title, 0, 75)] });
  const precomp = (ind: number, nm: string, refId: string, ip: number, op: number) => ({
    ty: 0,
    ind,
    nm,
    refId,
    ip,
    op,
    st: ip,
    w: 1920,
    h: 1080,
    ks: { o: still(100), p: still([960, 540, 0]), a: still([960, 540, 0]), s: still([100, 100, 100]), r: still(0) },
  });
  return {
    v: "5.12.1",
    fr: 25,
    ip: 0,
    op: 140,
    w: 1920,
    h: 1080,
    nm: "Master",
    fonts: { list: [{ fName: "Anton-Regular", fFamily: "Anton", fStyle: "Regular" }] },
    assets: [pre("comp_1", "First"), pre("comp_2", "Second")],
    layers: [precomp(1, "Opening", "comp_1", 0, 75), precomp(2, "Closing", "comp_2", 65, 140)],
  };
}
