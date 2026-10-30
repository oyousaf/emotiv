import { Composition } from "remotion";
import type { CompositionProps } from "../lib/schema";
import { calculateMetadata, Main } from "./Main";
import { blankDoc } from "../lib/templates";

export const COMPOSITION_ID = "Main";

/**
 * A single data-driven composition. Size, fps and duration all come from the
 * props via calculateMetadata, so the render worker and the editor preview
 * drive the exact same component with the exact same project document.
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={Main}
    calculateMetadata={calculateMetadata}
    defaultProps={{ doc: blankDoc(), assets: {} } satisfies CompositionProps}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
  />
);
