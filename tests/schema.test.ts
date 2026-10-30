import { describe, expect, it } from "vitest";
import { exampleDoc } from "@/lib/example";
import { projectDoc, scene, textElement } from "@/lib/schema";
import { BUILTIN_TEMPLATES, blankDoc, cloneScene } from "@/lib/templates";

const ids = { video: "v1", image: "i1", font: "f1", audio: "a1", fontFamily: "Anton" };

describe("project schema", () => {
  it("accepts every built-in template in both formats", () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const format of ["landscape", "vertical"] as const) {
        expect(() => scene.parse(t.build(format)), t.id).not.toThrow();
      }
    }
  });

  it("accepts the example project", () => {
    const doc = exampleDoc(ids);
    expect(doc.scenes).toHaveLength(5);
    expect(doc.soundtrack?.assetId).toBe("a1");
  });

  it("fills defaults for minimal elements", () => {
    const el = textElement.parse({ id: "t1", type: "text", text: "Hi" });
    expect(el.fontSize).toBe(96);
    expect(el.animIn.preset).toBe("fade");
    expect(el.duration).toBeNull();
  });

  it("rejects colours and font names that could inject CSS", () => {
    expect(() => textElement.parse({ id: "t", type: "text", text: "x", color: "red;}" })).toThrow();
    expect(() => textElement.parse({ id: "t", type: "text", text: "x", fontFamily: 'Arial"; background:url(x)' })).toThrow();
  });

  it("rejects ids that could become path segments", () => {
    const doc = blankDoc();
    doc.scenes[0].background = { type: "image", assetId: "../../etc", dim: 0, kenBurns: false };
    expect(() => projectDoc.parse(doc)).toThrow();
  });

  it("requires at least one scene", () => {
    expect(() => projectDoc.parse({ scenes: [] })).toThrow();
  });

  it("cloneScene gives fresh ids", () => {
    const s = BUILTIN_TEMPLATES[0].build("landscape");
    const c = cloneScene(s);
    expect(c.id).not.toBe(s.id);
    expect(c.elements.map((e) => e.id)).not.toEqual(s.elements.map((e) => e.id));
    expect(c.elements.map((e) => e.type)).toEqual(s.elements.map((e) => e.type));
  });
});
