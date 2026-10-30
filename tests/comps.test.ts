import { afterAll, describe, expect, it } from "vitest";
import { listAepComps, listAepxComps, readCdta } from "@/lib/importers/aep";
import { extractLottieComp, listLottieComps } from "@/lib/importers/comps";
import { importProject } from "@/lib/server/import";
import { sequencedLottie } from "./fixtures/lottie";
import { useTempDataDir } from "./helpers";

const tmp = useTempDataDir();
afterAll(tmp.cleanup);

// ---------------------------------------------------- synthetic .aep (RIFX)

const be32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const be16 = (n: number) => Buffer.from([(n >>> 8) & 255, n & 255]);
function chunk(id: string, data: Buffer): Buffer {
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(id, "latin1"), be32(data.length), data, pad]);
}
const list = (type: string, ...children: Buffer[]) => chunk("LIST", Buffer.concat([Buffer.from(type, "latin1"), ...children]));
const utf8 = (s: string) => chunk("Utf8", Buffer.from(s, "utf8"));

function cdta(w: number, h: number, fps: number, seconds: number, bg: [number, number, number]) {
  const d = Buffer.alloc(160);
  be32(1).copy(d, 5); // frame rate divisor
  be32(fps).copy(d, 9); // frame rate dividend
  be32(seconds * 100).copy(d, 45); // duration dividend
  be32(100).copy(d, 49); // duration divisor
  Buffer.from(bg).copy(d, 53);
  be16(w).copy(d, 140);
  be16(h).copy(d, 142);
  return chunk("cdta", d);
}

function textDoc(s: string) {
  const u16 = Buffer.alloc(s.length * 2);
  for (let i = 0; i < s.length; i++) u16.writeUInt16BE(s.charCodeAt(i), i * 2);
  return chunk("btdk", Buffer.concat([Buffer.from("<< /Text (", "latin1"), Buffer.from([0xfe, 0xff]), u16, Buffer.from([0x00, 0x29]), Buffer.from(" >>")]));
}

function sampleAep(): Buffer {
  const body = Buffer.concat([
    Buffer.from("Egg!", "latin1"),
    list(
      "Fold",
      list("Item", chunk("idta", Buffer.alloc(18)), utf8("Main promo"), cdta(1920, 1080, 25, 12, [18, 6, 43]),
        list("Layr", utf8("Headline"), list("tdgp", textDoc("SPRING DROP"))),
        list("Layr", utf8("Lower third")),
        list("Layr", utf8("BG")),
      ),
      list("Item", chunk("idta", Buffer.alloc(18)), utf8("clip.mp4")),
      list("Item", chunk("idta", Buffer.alloc(18)), utf8("Lower third"), cdta(1920, 1080, 25, 4, [0, 0, 0]),
        list("Layr", utf8("Name"), list("tdgp", textDoc("Alex Morgan"))),
      ),
    ),
  ]);
  return Buffer.concat([Buffer.from("RIFX", "latin1"), be32(body.length), body]);
}

describe("After Effects project (.aep)", () => {
  const comps = listAepComps(sampleAep());

  it("lists only compositions, with names and layers", () => {
    expect(comps.map((c) => c.name)).toEqual(["Main promo", "Lower third"]);
    expect(comps[0].layers.map((l) => l.name)).toEqual(["Headline", "Lower third", "BG"]);
    expect(comps[0].counts).toEqual({ text: 1, layer: 2 });
  });

  it("reads size, frame rate, duration and background from cdta", () => {
    expect(comps[0]).toMatchObject({ width: 1920, height: 1080, fps: 25, durationSeconds: 12, backgroundColor: "#12062b" });
    expect(comps[1].durationSeconds).toBe(4);
  });

  it("pulls text out of text layers and spots precomps", () => {
    expect(comps[0].texts).toEqual(["SPRING DROP"]);
    expect(comps[1].texts).toEqual(["Alex Morgan"]);
    expect(comps[1].usedBy).toBe(1);
    expect(comps[0].usedBy).toBe(0);
  });

  it("ignores implausible cdta values instead of reporting nonsense", () => {
    expect(readCdta(new Uint8Array(20))).toMatchObject({ width: null, height: null, fps: null, durationSeconds: null });
  });

  it("rejects files that aren't After Effects projects", () => {
    expect(() => listAepComps(Buffer.from("hello world, not a project"))).toThrow(/RIFX/);
  });
});

describe("After Effects XML project (.aepx)", () => {
  const hex = (b: Buffer) => b.subarray(8).toString("hex"); // strip chunk header
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AfterEffectsProject xmlns="http://www.adobe.com/products/aftereffects">
  <Fold>
    <Item><idta bdata="00"/><string>Main &amp; Titles</string><cdta bdata="${hex(cdta(1080, 1920, 30, 8, [255, 46, 136]))}"/>
      <Layr><string>Caption</string><tdgp><btdk bdata="${hex(textDoc("TAP TO JOIN"))}"/></tdgp></Layr>
    </Item>
    <Item><idta bdata="00"/><string>logo.png</string></Item>
  </Fold>
</AfterEffectsProject>`;

  it("finds the same information in the XML form", () => {
    const comps = listAepxComps(xml);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toMatchObject({ name: "Main & Titles", width: 1080, height: 1920, fps: 30, durationSeconds: 8, texts: ["TAP TO JOIN"] });
  });
});

describe("Lottie compositions", () => {
  it("lists the main comp and each precomp", () => {
    const comps = listLottieComps(sequencedLottie());
    expect(comps.map((c) => [c.id, c.name, c.usedBy])).toEqual([
      ["root", "Master", 0],
      ["comp_1", "Opening", 1],
      ["comp_2", "Closing", 1],
    ]);
    expect(comps[1]).toMatchObject({ width: 1920, height: 1080, fps: 25, durationSeconds: 3, counts: { text: 1 }, fonts: ["Anton-Regular"] });
  });

  it("promotes a precomp to a standalone animation", () => {
    const one = extractLottieComp(sequencedLottie(), "comp_2");
    expect(one).toMatchObject({ nm: "Closing", ip: 0, op: 75 });
    expect(one.layers).toHaveLength(1);
    expect(() => extractLottieComp(sequencedLottie(), "nope")).toThrow();
  });
});

describe("importing a chosen comp", () => {
  it("imports one precomp from a Lottie and records it as the source", async () => {
    const { project } = await importProject(
      { lottie: { name: "master.json", buf: Buffer.from(JSON.stringify(sequencedLottie())) } },
      { compId: "comp_2" },
    );
    expect(project.doc.scenes).toHaveLength(1);
    expect(project.doc.scenes[0].duration).toBe(90);
    expect(project.doc.source).toMatchObject({ kind: "lottie", comp: "Closing" });
  });

  it("builds a starting point from .aep comp metadata", async () => {
    const comp = listAepComps(sampleAep())[0];
    const { project, report } = await importProject({}, { aep: { file: "promo.aep", ...comp } });
    expect(project.name).toBe("Main promo");
    expect(project.format).toBe("landscape");
    expect(project.doc.scenes[0]).toMatchObject({ name: "Main promo", duration: 360, background: { type: "color", color: "#12062b" } });
    expect(project.doc.scenes[0].elements.map((e) => (e.type === "text" ? [e.name, e.text] : null))).toEqual([["Headline", "SPRING DROP"]]);
    expect(project.doc.source).toMatchObject({ kind: "aep", file: "promo.aep", comp: "Main promo" });
    expect(project.doc.source?.layers).toHaveLength(3);
    expect(report.notes.join(" ")).toMatch(/Bodymovin/);
  });
});
