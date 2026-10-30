import { Audio, Video } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import { linearTiming, TransitionSeries, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import type { CompositionProps, ResolvedAsset, Scene } from "../lib/schema";
import { FORMATS } from "../lib/schema";
import { effectiveTransition, elementWindow, getTotalDuration } from "../lib/timeline";
import { ElementView } from "./elements";

type Assets = Record<string, ResolvedAsset>;

function useProjectFonts(assets: Assets) {
  const fonts = Object.values(assets).filter((a) => a.kind === "font" && a.family);
  const key = fonts.map((f) => f.url).join("|");
  const [handle] = useState(() => delayRender("Loading project fonts"));
  useEffect(() => {
    Promise.all(fonts.map((f) => loadFont({ family: f.family!, url: f.url }).catch(() => undefined))).finally(
      () => continueRender(handle),
    );
    // Fonts are keyed by URL; re-running for the same set is pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handle]);
}

const SceneBackground: React.FC<{ scene: Scene; assets: Assets }> = ({ scene, assets }) => {
  const frame = useCurrentFrame();
  const bg = scene.background;
  switch (bg.type) {
    case "color":
      return <AbsoluteFill style={{ backgroundColor: bg.color }} />;
    case "gradient":
      return <AbsoluteFill style={{ background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` }} />;
    case "image": {
      const asset = assets[bg.assetId];
      const scale = bg.kenBurns ? interpolate(frame, [0, scene.duration], [1, 1.12]) : 1;
      return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
          {asset?.kind === "image" ? (
            <Img
              src={asset.url}
              style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
            />
          ) : null}
          <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${bg.dim})` }} />
        </AbsoluteFill>
      );
    }
    case "video": {
      const asset = assets[bg.assetId];
      return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
          {asset?.kind === "video" ? (
            <Video
              src={asset.url}
              muted
              loop={bg.loop}
              trimBefore={bg.trimBefore || undefined}
              playbackRate={bg.playbackRate}
              objectFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : null}
          <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${bg.dim})` }} />
        </AbsoluteFill>
      );
    }
  }
};

export const SceneView: React.FC<{ scene: Scene; assets: Assets }> = ({ scene, assets }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <SceneBackground scene={scene} assets={assets} />
    {scene.elements.map((el) => {
      const w = elementWindow(el, scene.duration);
      return (
        <Sequence key={el.id} from={w.start} durationInFrames={w.duration} layout="none" name={el.name || el.type}>
          <ElementView el={el} duration={w.duration} assets={assets} />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);

function presentationFor(type: Scene["transition"]["type"], vertical: boolean): TransitionPresentation<Record<string, unknown>> {
  switch (type) {
    case "slide":
      return slide({ direction: vertical ? "from-bottom" : "from-right" }) as TransitionPresentation<Record<string, unknown>>;
    case "wipe":
      return wipe({ direction: "from-left" }) as TransitionPresentation<Record<string, unknown>>;
    case "flip":
      return flip({ direction: "from-right" }) as TransitionPresentation<Record<string, unknown>>;
    default:
      return fade() as TransitionPresentation<Record<string, unknown>>;
  }
}

const Soundtrack: React.FC<{ props: CompositionProps }> = ({ props }) => {
  const { durationInFrames } = useVideoConfig();
  const track = props.doc.soundtrack;
  const asset = track ? props.assets[track.assetId] : undefined;
  if (!track || asset?.kind !== "audio") return null;
  // fadeOut can be 0 (imported soundtracks), which would give interpolate a duplicate point.
  const fadeStart = Math.max(0, durationInFrames - track.fadeOut);
  return (
    <Audio
      src={asset.url}
      volume={(f) =>
        fadeStart >= durationInFrames
          ? track.volume
          : interpolate(f, [fadeStart, durationInFrames], [track.volume, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
      }
    />
  );
};

export const Main: React.FC<CompositionProps> = (props) => {
  const { doc, assets } = props;
  const { width, height } = useVideoConfig();
  useProjectFonts(assets);
  const vertical = height > width;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {doc.scenes.map((scene, i) => {
          const t = effectiveTransition(doc.scenes, i);
          return (
            <React.Fragment key={scene.id}>
              {t > 0 ? (
                <TransitionSeries.Transition
                  presentation={presentationFor(scene.transition.type, vertical)}
                  timing={linearTiming({ durationInFrames: t })}
                />
              ) : null}
              <TransitionSeries.Sequence durationInFrames={scene.duration} name={scene.name}>
                <SceneView scene={scene} assets={assets} />
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
      </TransitionSeries>
      <Soundtrack props={props} />
      <ReferenceOverlay props={props} />
    </AbsoluteFill>
  );
};

/** The old video on top, semi-transparent, for tracing. Preview only. */
const ReferenceOverlay: React.FC<{ props: CompositionProps }> = ({ props }) => {
  const ref = props.doc.reference;
  const asset = ref ? props.assets[ref.assetId] : undefined;
  if (!props.showReference || !ref || asset?.kind !== "video") return null;
  return (
    <AbsoluteFill style={{ opacity: ref.opacity, pointerEvents: "none" }}>
      <Video src={asset.url} muted objectFit="contain" style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};

export const calculateMetadata: CalculateMetadataFunction<CompositionProps> = ({ props }) => {
  const format = props.format ?? props.doc.format;
  return {
    durationInFrames: getTotalDuration(props.doc),
    fps: props.doc.fps,
    width: FORMATS[format].width,
    height: FORMATS[format].height,
  };
};
