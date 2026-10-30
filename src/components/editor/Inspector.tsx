"use client";

import { useState } from "react";
import {
  addElement,
  duplicateElement,
  moveElement,
  removeElement,
  updateElement,
  updateScene,
} from "@/lib/doc-ops";
import {
  ANIMATION_PRESETS,
  EASINGS,
  LOOP_MODES,
  SPLIT_MODES,
  TRANSITIONS,
  type AnimationIn,
  type AnimationOut,
  type Background,
  type SceneElement,
  type ShapeElement,
  type TextElement,
} from "@/lib/schema";
import { shape, text } from "@/lib/templates";
import { api } from "../api";
import { useEditor } from "./context";
import { ColorField, Field, NumberField, RangeField, Section, SelectField, Toggle } from "../fields";

const PRESET_LABELS: Record<string, string> = {
  none: "None",
  fade: "Fade",
  slideUp: "Slide up",
  slideDown: "Slide down",
  slideLeft: "Slide left",
  slideRight: "Slide right",
  scale: "Scale",
  pop: "Pop",
  blur: "Blur",
  maskUp: "Mask reveal",
  tracking: "Tracking in",
  rotate: "Rotate in",
  wipeRight: "Wipe",
  typewriter: "Typewriter",
};
const presetOptions = ANIMATION_PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }));

export function Inspector() {
  const { element } = useEditor();
  return element ? <ElementInspector key={element.id} /> : <SceneInspector />;
}

// ------------------------------------------------------------------- scene

function SceneInspector() {
  const { doc, setDoc, scene, select, assets, refreshTemplates } = useEditor();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const set = (patch: Parameters<typeof updateScene>[2]) => setDoc((d) => updateScene(d, scene.id, patch));
  const setBg = (bg: Background) => set({ background: bg });
  const bg = scene.background;
  const images = assets.filter((a) => a.kind === "image");
  const videos = assets.filter((a) => a.kind === "video");
  const soundtrackAsset = assets.find((a) => a.id === doc.soundtrack?.assetId);

  const changeBgType = (type: Background["type"]) => {
    if (type === bg.type) return;
    if (type === "color") setBg({ type, color: "#111118" });
    if (type === "gradient") setBg({ type, from: "#12062b", to: "#5b12a8", angle: 135 });
    if (type === "image" && images[0]) setBg({ type, assetId: images[0].id, dim: 0.3, kenBurns: true });
    if (type === "video" && videos[0]) setBg({ type, assetId: videos[0].id, dim: 0.3, playbackRate: 1 });
  };

  const add = (el: SceneElement) => {
    setDoc((d) => addElement(d, scene.id, el));
    select({ sceneId: scene.id, elementId: el.id });
  };

  const saveTemplate = async () => {
    const name = prompt("Template name", scene.name);
    if (!name) return;
    try {
      await api.saveTemplate(name, scene);
      await refreshTemplates();
      setSavedMsg(`Saved “${name}”. It's now in Add scene and New project.`);
    } catch (e) {
      setSavedMsg((e as Error).message);
    }
  };

  return (
    <div>
      <Section title="Scene">
        <Field label="Name">
          <input className="field" value={scene.name} maxLength={80} onChange={(e) => set({ name: e.target.value || "Scene" })} />
        </Field>
        <NumberField
          label="Duration (frames)"
          value={scene.duration}
          min={15}
          max={18000}
          suffix={`${(scene.duration / doc.fps).toFixed(1)}s`}
          onChange={(v) => set({ duration: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Transition in"
            value={scene.transition.type}
            options={TRANSITIONS}
            onChange={(type) => set({ transition: { ...scene.transition, type } })}
          />
          <NumberField
            label="Length"
            value={scene.transition.duration}
            min={1}
            max={120}
            suffix="f"
            onChange={(v) => set({ transition: { ...scene.transition, duration: v } })}
          />
        </div>
        {doc.scenes[0].id === scene.id && scene.transition.type !== "none" ? (
          <p className="text-[11px] text-ink-500">The first scene has nothing to transition from.</p>
        ) : null}
      </Section>

      <Section title="Background">
        <div className="flex rounded-md border border-ink-600 p-0.5 text-xs">
          {(["color", "gradient", "image", "video"] as const).map((t) => {
            const disabled = (t === "image" && !images.length) || (t === "video" && !videos.length);
            return (
              <button
                key={t}
                disabled={disabled}
                title={disabled ? `Upload a${t === "image" ? "n image" : " video"} first` : undefined}
                onClick={() => changeBgType(t)}
                className={`flex-1 rounded py-1 capitalize disabled:opacity-30 ${bg.type === t ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-200"}`}
              >
                {t}
              </button>
            );
          })}
        </div>
        {bg.type === "color" ? <ColorField label="Colour" value={bg.color} onChange={(c) => c && setBg({ ...bg, color: c })} /> : null}
        {bg.type === "gradient" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ColorField label="From" value={bg.from} onChange={(c) => c && setBg({ ...bg, from: c })} />
              <ColorField label="To" value={bg.to} onChange={(c) => c && setBg({ ...bg, to: c })} />
            </div>
            <RangeField label="Angle" min={0} max={360} step={1} value={bg.angle} format={(v) => `${v}°`} onChange={(v) => setBg({ ...bg, angle: v })} />
          </>
        ) : null}
        {bg.type === "image" || bg.type === "video" ? (
          <>
            <SelectField
              label={bg.type === "image" ? "Image" : "Video"}
              value={bg.assetId}
              options={(bg.type === "image" ? images : videos).map((a) => ({ value: a.id, label: a.name }))}
              onChange={(assetId) => setBg({ ...bg, assetId })}
            />
            <RangeField label="Darken" min={0} max={1} value={bg.dim} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setBg({ ...bg, dim: v })} />
            {bg.type === "image" ? (
              <Toggle label="Slow zoom (Ken Burns)" checked={bg.kenBurns} onChange={(v) => setBg({ ...bg, kenBurns: v })} />
            ) : (
              <RangeField label="Speed" min={0.25} max={4} step={0.25} value={bg.playbackRate} format={(v) => `${v}×`} onChange={(v) => setBg({ ...bg, playbackRate: v })} />
            )}
          </>
        ) : null}
      </Section>

      <Section
        title="Layers"
        actions={
          <div className="flex gap-1">
            <button className="btn !px-2 !py-0.5 text-[11px]" onClick={() => add(text({ name: "Text", text: "New text", fontSize: 96 }))}>
              + Text
            </button>
            <button className="btn !px-2 !py-0.5 text-[11px]" onClick={() => add(shape({ name: "Shape", width: 30, height: 12, animIn: { preset: "wipeRight" } }))}>
              + Shape
            </button>
          </div>
        }
      >
        {scene.elements.length === 0 ? <p className="text-xs text-ink-500">No layers. Add text, a shape, or an image from Assets.</p> : null}
        <ul className="space-y-1">
          {[...scene.elements].reverse().map((el) => (
            <li key={el.id}>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-ink-800"
                onClick={() => select({ sceneId: scene.id, elementId: el.id }, { seek: true })}
              >
                <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-ink-500">{el.type}</span>
                <span className="truncate">{el.name || (el.type === "text" ? el.text : el.type)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-ink-600">Top of the list draws on top.</p>
      </Section>

      {doc.soundtrack ? (
        <Section title="Soundtrack">
          <p className="truncate text-xs text-ink-300">♪ {soundtrackAsset?.name ?? "Missing asset"}</p>
          <RangeField
            label="Volume"
            min={0}
            max={1}
            value={doc.soundtrack.volume}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setDoc((d) => ({ ...d, soundtrack: d.soundtrack && { ...d.soundtrack, volume: v } }))}
          />
          <NumberField
            label="Fade out (frames)"
            value={doc.soundtrack.fadeOut}
            min={0}
            max={300}
            onChange={(v) => setDoc((d) => ({ ...d, soundtrack: d.soundtrack && { ...d.soundtrack, fadeOut: v } }))}
          />
          <button className="btn w-full text-xs" onClick={() => setDoc((d) => ({ ...d, soundtrack: null }))}>
            Remove soundtrack
          </button>
        </Section>
      ) : null}

      <Section title="Reuse">
        <button className="btn w-full text-xs" onClick={saveTemplate}>
          Save scene as template
        </button>
        {savedMsg ? <p className="text-[11px] text-ink-400">{savedMsg}</p> : null}
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- element

function ElementInspector() {
  const { setDoc, scene, element, select, fonts, assets } = useEditor();
  const el = element!;
  const set = (patch: Partial<SceneElement>) => setDoc((d) => updateElement(d, scene.id, el.id, patch));
  const setIn = (patch: Partial<AnimationIn>) => set({ animIn: { ...el.animIn, ...patch } });
  const setOut = (patch: Partial<AnimationOut>) => set({ animOut: { ...el.animOut, ...patch } });

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-ink-800 px-3 py-2">
        <button className="btn btn-ghost btn-icon text-xs text-ink-400" onClick={() => select({ sceneId: scene.id, elementId: null })}>
          ← {scene.name}
        </button>
        <div className="ml-auto flex gap-0.5">
          <button className="btn btn-ghost btn-icon text-xs" title="Bring forward" onClick={() => setDoc((d) => moveElement(d, scene.id, el.id, 1))}>
            ↑
          </button>
          <button className="btn btn-ghost btn-icon text-xs" title="Send backward" onClick={() => setDoc((d) => moveElement(d, scene.id, el.id, -1))}>
            ↓
          </button>
          <button
            className="btn btn-ghost btn-icon text-xs"
            title="Duplicate"
            onClick={() =>
              setDoc((d) => {
                const r = duplicateElement(d, scene.id, el.id);
                if (!r) return d;
                queueMicrotask(() => select({ sceneId: scene.id, elementId: r.element.id }));
                return r.doc;
              })
            }
          >
            ⧉
          </button>
          <button
            className="btn btn-ghost btn-icon text-xs hover:text-bad"
            title="Delete layer"
            onClick={() => {
              setDoc((d) => removeElement(d, scene.id, el.id));
              select({ sceneId: scene.id, elementId: null });
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {el.type === "text" ? <TextFields el={el} set={set} fonts={fonts} /> : null}
      {el.type === "shape" ? <ShapeFields el={el} set={set} /> : null}
      {el.type === "image" ? (
        <Section title="Image">
          <SelectField
            label="Asset"
            value={el.assetId}
            options={assets.filter((a) => a.kind === "image").map((a) => ({ value: a.id, label: a.name }))}
            onChange={(assetId) => set({ assetId })}
          />
        </Section>
      ) : null}

      <Section title="Layout">
        <Field label="Layer name">
          <input className="field" value={el.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={el.x} min={-100} max={200} step={0.5} suffix="%" onChange={(x) => set({ x })} />
          <NumberField label="Y" value={el.y} min={-100} max={200} step={0.5} suffix="%" onChange={(y) => set({ y })} />
          <NumberField label="Width" value={el.width} min={0.1} max={200} step={0.5} suffix="%" onChange={(width) => set({ width })} />
          {el.type === "shape" ? (
            <NumberField label="Height" value={el.height} min={0.1} max={200} step={0.5} suffix="%" onChange={(height) => set({ height } as Partial<ShapeElement>)} />
          ) : (
            <NumberField label="Rotation" value={el.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => set({ rotation })} />
          )}
        </div>
        {el.type === "shape" ? (
          <NumberField label="Rotation" value={el.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => set({ rotation })} />
        ) : null}
        <RangeField label="Opacity" min={0} max={1} value={el.opacity} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => set({ opacity })} />
      </Section>

      <Section title="Timing">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Start" value={el.start} min={0} max={scene.duration - 1} suffix="f" onChange={(start) => set({ start })} />
          <NumberField
            label="Duration"
            value={el.duration ?? scene.duration - el.start}
            min={1}
            max={scene.duration}
            suffix="f"
            onChange={(duration) => set({ duration })}
          />
        </div>
        <Toggle label="Hold until scene ends" checked={el.duration == null} onChange={(v) => set({ duration: v ? null : scene.duration - el.start })} />
      </Section>

      <Section title="Animate in">
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Preset" value={el.animIn.preset} options={presetOptions} onChange={(preset) => setIn({ preset })} />
          <SelectField label="Easing" value={el.animIn.easing} options={EASINGS} onChange={(easing) => setIn({ easing })} />
          <NumberField label="Duration" value={el.animIn.duration} min={1} max={600} suffix="f" onChange={(duration) => setIn({ duration })} />
          <NumberField label="Delay" value={el.animIn.delay} min={0} max={3000} suffix="f" onChange={(delay) => setIn({ delay })} />
        </div>
        {el.type === "text" && el.animIn.preset !== "typewriter" ? (
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Split by" value={el.animIn.split} options={SPLIT_MODES} onChange={(split) => setIn({ split })} />
            <NumberField label="Stagger" value={el.animIn.stagger} min={0} max={60} suffix="f" onChange={(stagger) => setIn({ stagger })} />
          </div>
        ) : null}
        {el.animIn.preset.startsWith("slide") || el.animIn.preset === "rotate" ? (
          <NumberField label="Distance" value={el.animIn.distance} min={0} max={2000} suffix="px" onChange={(distance) => setIn({ distance })} />
        ) : null}
      </Section>

      <Section title="Animate out">
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Preset"
            value={el.animOut.preset}
            options={presetOptions.filter((p) => p.value !== "typewriter")}
            onChange={(preset) => setOut({ preset })}
          />
          <SelectField label="Easing" value={el.animOut.easing} options={EASINGS.filter((e) => e !== "spring")} onChange={(easing) => setOut({ easing })} />
          <NumberField label="Duration" value={el.animOut.duration} min={1} max={600} suffix="f" onChange={(duration) => setOut({ duration })} />
          <SelectField label="Loop while visible" value={el.loop} options={LOOP_MODES} onChange={(loop) => set({ loop })} />
        </div>
      </Section>
    </div>
  );
}

function TextFields({ el, set, fonts }: { el: TextElement; set: (p: Partial<TextElement>) => void; fonts: string[] }) {
  return (
    <Section title="Text">
      <Field label="Content">
        <textarea className="field min-h-20 resize-y" value={el.text} maxLength={2000} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      <SelectField
        label="Font"
        value={el.fontFamily}
        options={(fonts.includes(el.fontFamily) ? fonts : [el.fontFamily, ...fonts]).map((f) => ({ value: f, label: f }))}
        onChange={(fontFamily) => set({ fontFamily })}
      />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Size" value={el.fontSize} min={4} max={800} suffix="px" onChange={(fontSize) => set({ fontSize })} />
        <SelectField
          label="Weight"
          value={String(el.fontWeight)}
          options={["100", "200", "300", "400", "500", "600", "700", "800", "900"]}
          onChange={(w) => set({ fontWeight: Number(w) })}
        />
        <SelectField label="Align" value={el.align} options={["left", "center", "right"] as const} onChange={(align) => set({ align })} />
        <NumberField label="Tracking" value={el.letterSpacing} min={-0.5} max={2} step={0.01} suffix="em" onChange={(letterSpacing) => set({ letterSpacing })} />
        <NumberField label="Leading" value={el.lineHeight} min={0.5} max={3} step={0.05} onChange={(lineHeight) => set({ lineHeight })} />
      </div>
      <div className="flex gap-4">
        <Toggle label="Uppercase" checked={el.uppercase} onChange={(uppercase) => set({ uppercase })} />
        <Toggle label="Italic" checked={el.italic} onChange={(italic) => set({ italic })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Colour" value={el.color} onChange={(c) => c && set({ color: c })} />
        <ColorField label="Box" value={el.boxColor} allowNone onChange={(boxColor) => set({ boxColor })} />
        <ColorField label="Glow colour" value={el.glowColor} onChange={(c) => c && set({ glowColor: c })} />
        <NumberField label="Glow" value={el.glow} min={0} max={200} suffix="px" onChange={(glow) => set({ glow })} />
        <ColorField label="Stroke colour" value={el.strokeColor} onChange={(c) => c && set({ strokeColor: c })} />
        <NumberField label="Stroke" value={el.strokeWidth} min={0} max={40} suffix="px" onChange={(strokeWidth) => set({ strokeWidth })} />
      </div>
      <Toggle
        label="Count up a number"
        checked={el.counter != null}
        onChange={(v) =>
          set({ counter: v ? { from: 0, to: Number(el.text.replace(/[^0-9.]/g, "")) || 100, decimals: 0, prefix: "", suffix: "", duration: 45 } : null })
        }
      />
      {el.counter ? (
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="From" value={el.counter.from} step={0.1} onChange={(from) => set({ counter: { ...el.counter!, from } })} />
          <NumberField label="To" value={el.counter.to} step={0.1} onChange={(to) => set({ counter: { ...el.counter!, to } })} />
          <NumberField label="Decimals" value={el.counter.decimals} min={0} max={4} onChange={(decimals) => set({ counter: { ...el.counter!, decimals } })} />
          <Field label="Prefix">
            <input className="field" value={el.counter.prefix} maxLength={16} onChange={(e) => set({ counter: { ...el.counter!, prefix: e.target.value } })} />
          </Field>
          <Field label="Suffix">
            <input className="field" value={el.counter.suffix} maxLength={16} onChange={(e) => set({ counter: { ...el.counter!, suffix: e.target.value } })} />
          </Field>
          <NumberField label="Frames" value={el.counter.duration} min={1} max={600} onChange={(duration) => set({ counter: { ...el.counter!, duration } })} />
        </div>
      ) : null}
    </Section>
  );
}

function ShapeFields({ el, set }: { el: ShapeElement; set: (p: Partial<ShapeElement>) => void }) {
  return (
    <Section title="Shape">
      <SelectField label="Shape" value={el.shape} options={["rect", "ellipse"] as const} onChange={(s) => set({ shape: s })} />
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Fill" value={el.color} onChange={(c) => c && set({ color: c })} />
        <NumberField label="Corner radius" value={el.radius} min={0} max={1000} suffix="px" onChange={(radius) => set({ radius })} />
        <ColorField label="Border" value={el.borderColor} onChange={(c) => c && set({ borderColor: c })} />
        <NumberField label="Border width" value={el.borderWidth} min={0} max={100} suffix="px" onChange={(borderWidth) => set({ borderWidth })} />
      </div>
    </Section>
  );
}
