import type React from "react";
import { Img, useCurrentFrame, useVideoConfig } from "remotion";
import type {
  ImageElement,
  ResolvedAsset,
  SceneElement,
  ShapeElement,
  TextElement,
} from "../lib/schema";
import {
  animState,
  combine,
  IDENTITY,
  loopState,
  progress,
  splitText,
  toTransform,
  usesMask,
  type AnimState,
} from "./animation";

type Assets = Record<string, ResolvedAsset>;

/** CSS font stack: the chosen family with safe fallbacks. */
export const fontStack = (family: string) =>
  `"${family}", "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif`;

function boxStyle(el: SceneElement, height?: number): React.CSSProperties {
  return {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.width}%`,
    height: height == null ? undefined : `${height}%`,
    transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
    opacity: el.opacity,
  };
}

function wholeState(el: SceneElement, frame: number, fps: number, duration: number): AnimState {
  const base = animState({ frame, fps, elementDuration: duration, animIn: el.animIn, animOut: el.animOut });
  return combine(base, { ...IDENTITY, ...loopState(el.loop, frame, fps) });
}

function stateStyle(s: AnimState, origin = "50% 50%"): React.CSSProperties {
  return {
    opacity: s.opacity,
    transform: toTransform(s),
    transformOrigin: origin,
    filter: s.blur > 0.05 ? `blur(${s.blur}px)` : undefined,
  };
}

/** Text with a counter shows the interpolated number instead of `text`. */
export function displayText(el: TextElement, frame: number, fps: number): string {
  let text = el.text;
  if (el.counter) {
    const c = el.counter;
    const p = progress(frame, el.animIn.delay, c.duration, "easeOut", fps);
    const value = c.from + (c.to - c.from) * p;
    text = `${c.prefix}${value.toLocaleString("en-US", {
      minimumFractionDigits: c.decimals,
      maximumFractionDigits: c.decimals,
    })}${c.suffix}`;
  }
  return el.uppercase ? text.toUpperCase() : text;
}

const TextView: React.FC<{ el: TextElement; duration: number }> = ({ el, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = displayText(el, frame, fps);
  const whole = combine(
    { ...IDENTITY, ...loopState(el.loop, frame, fps) },
    // The out animation always applies to the element as a whole.
    animState({
      frame,
      fps,
      elementDuration: duration,
      animIn: { ...el.animIn, preset: "none" },
      animOut: el.animOut,
    }),
  );

  const split = el.animIn.preset === "typewriter" ? "none" : el.animIn.split;
  const units = splitText(text, split);
  const mask = usesMask(el.animIn.preset);

  const glow =
    el.glow > 0 ? `0 0 ${el.glow * 0.25}px ${el.glowColor}, 0 0 ${el.glow}px ${el.glowColor}` : undefined;

  const textStyle: React.CSSProperties = {
    fontFamily: fontStack(el.fontFamily),
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    fontStyle: el.italic ? "italic" : "normal",
    color: el.color,
    textAlign: el.align,
    lineHeight: el.lineHeight,
    whiteSpace: "pre-wrap",
    WebkitTextStroke: el.strokeWidth > 0 ? `${el.strokeWidth}px ${el.strokeColor}` : undefined,
    paintOrder: "stroke fill",
    textShadow: glow,
  };

  const renderUnit = (unit: string, index: number) => {
    const s = animState({
      frame,
      fps,
      elementDuration: duration,
      animIn: el.animIn,
      animOut: { ...el.animOut, preset: "none" },
      unit: split === "none" ? undefined : { index, count: units.length },
    });
    let content = unit;
    if (el.animIn.preset === "typewriter") {
      content = unit.slice(0, Math.round(unit.length * s.reveal));
    }
    const inner = (
      <span
        style={{
          display: split === "lines" ? "block" : "inline-block",
          letterSpacing: `${el.letterSpacing + s.letterSpacing}em`,
          ...stateStyle(s),
        }}
      >
        {content || (split === "lines" ? " " : "")}
      </span>
    );
    if (!mask) return <span key={index}>{inner}</span>;
    return (
      <span
        key={index}
        style={{
          display: split === "lines" ? "block" : "inline-block",
          overflow: "hidden",
          verticalAlign: "bottom",
          // Room for descenders and glow inside the mask.
          padding: "0.08em 0.04em",
          margin: "-0.08em -0.04em",
        }}
      >
        {inner}
      </span>
    );
  };

  return (
    <div style={boxStyle(el)}>
      <div style={{ ...stateStyle(whole), textAlign: el.align }}>
        <div
          style={{
            ...textStyle,
            backgroundColor: el.boxColor ?? undefined,
            padding: el.boxColor ? `${el.boxPadding * 0.5}px ${el.boxPadding}px` : undefined,
            display: el.boxColor ? "inline-block" : "block",
          }}
        >
          {units.map(renderUnit)}
        </div>
      </div>
    </div>
  );
};

const ShapeView: React.FC<{ el: ShapeElement; duration: number }> = ({ el, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = wholeState(el, frame, fps, duration);
  return (
    <div style={boxStyle(el, el.height)}>
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: el.color,
          borderRadius: el.shape === "ellipse" ? "50%" : el.radius,
          border: el.borderWidth > 0 ? `${el.borderWidth}px solid ${el.borderColor}` : undefined,
          boxSizing: "border-box",
          ...stateStyle(s, el.animIn.preset === "wipeRight" ? "0% 50%" : "50% 50%"),
        }}
      />
    </div>
  );
};

const ImageView: React.FC<{ el: ImageElement; duration: number; assets: Assets }> = ({
  el,
  duration,
  assets,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asset = assets[el.assetId];
  if (!asset || asset.kind !== "image") return null;
  const s = wholeState(el, frame, fps, duration);
  return (
    <div style={boxStyle(el)}>
      <Img
        src={asset.url}
        style={{ width: "100%", height: "auto", display: "block", objectFit: el.fit, ...stateStyle(s) }}
      />
    </div>
  );
};

export const ElementView: React.FC<{ el: SceneElement; duration: number; assets: Assets }> = ({
  el,
  duration,
  assets,
}) => {
  switch (el.type) {
    case "text":
      return <TextView el={el} duration={duration} />;
    case "shape":
      return <ShapeView el={el} duration={duration} />;
    case "image":
      return <ImageView el={el} duration={duration} assets={assets} />;
  }
};
