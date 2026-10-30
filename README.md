# emotiv AI

**Where imagination becomes motion.**
A new dimension of creative expression.

A local-first motion graphics studio for rebuilding old After Effects text-and-graphics videos and producing short social clips. It runs on `localhost`, keeps everything in a local SQLite database and project folders, and needs no cloud account.

Built with Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Motion and Remotion 4.

## Setup

Requirements: **Node.js 22.13 or newer** (24 recommended, since the app uses the built-in `node:sqlite` module, so there's no native addon to compile) and about 300 MB of disk space for Chrome Headless Shell.

```bash
npm install
npm run setup     # creates data/, downloads Chrome Headless Shell, seeds the example project
npm run dev       # web app on http://localhost:3000 + the render worker
```

`npm run dev` runs two processes side by side: `next dev` and the render worker. To run them separately, use `npm run dev:web` and `npm run worker`.

For a production build: `npm run build`, then `npm start`.

## The example project

On first launch the dashboard seeds **Neon Launch (After Effects rebuild)**, a 15-second promo built from the files in [examples/neon-launch](examples/neon-launch). It has a looping MP4 background, masked line-by-line type in an uploaded font (Anton, OFL), a feature list, a counting stat, a social caption, a logo sting and a soundtrack. Its assets go through the same upload validation as your own files.

To export it without the UI:

```bash
npm run export:example                   # out/neon-launch-landscape.mp4
npm run export:example -- vertical high  # 1080x1920, higher quality
```

## Using the editor

- **Scenes** (left): add scenes from animation templates, then reorder, duplicate or delete them. Click a scene to jump the preview to it.
- **Preview** (centre): an embedded Remotion Player with transport controls, loop, mute, fullscreen and a 16:9 / 9:16 switch. Space plays and pauses, ← → step one frame (Shift for ten).
- **Timeline**: scene blocks and the selected scene's layers. Drag a layer to move it, drag its right edge to change its length, drag a scene's right edge to change the scene's length.
- **Inspector** (right): scene background (colour, gradient, image or video), transitions, layers, soundtrack, and per-layer text, colour, layout, timing and in/out/loop animation settings.
- **Assets**: drag and drop MP4, PNG/JPG/WebP/GIF, MP3/WAV/M4A/OGG and TTF/OTF/WOFF/WOFF2 files. Uploaded fonts appear in the font picker.
- **Export**: queue landscape and/or vertical renders at draft, standard or high quality. Progress updates live, and finished files download as MP4.
- **Templates**: "Save scene as template" stores a scene in SQLite, and it then shows up in Add scene and New project.
- Edits autosave, and Ctrl+Z / Ctrl+Shift+Z undo and redo.

### Seasonal theme

The interface's accent colours, background tint and emoji follow the Gregorian month (seasons follow the northern hemisphere): pumpkins in October, snowflakes in January, and so on. The theme picker on the dashboard can pin any month. The palettes live in [src/lib/season.ts](src/lib/season.ts).

## Architecture

```
src/
  remotion/        Compositions: pure, data-driven, browser-safe
    Main.tsx         Scenes → TransitionSeries, soundtrack, font loading, calculateMetadata
    elements.tsx     Text / shape / image layers
    animation.ts     Animation maths (presets, easing, stagger, loops), no React
    Root.tsx         One "Main" composition; size and length come from props
  lib/
    schema.ts        Zod schema for the project document (shared by everything)
    timeline.ts      Scene timing, transitions, durations
    templates.ts     Built-in animation templates + element builders
    doc-ops.ts       Immutable editor operations
    props.ts         Project + assets → composition props
    season.ts        Monthly UI themes
    server/          Node-only: never imported by client code
      db.ts            node:sqlite, WAL, migrations
      repo.ts          Projects, assets, render queue, custom templates
      paths.ts         All filesystem paths; id validation and containment checks
      uploads.ts       Extension allowlist + magic-byte sniffing + media probing
      files.ts         Range-capable file responses
      render.ts        Bundling, local asset server, renderMedia
  app/             Next.js pages and API routes
  components/      Dashboard and editor UI
worker/
  render-worker.ts Background renderer: polls the queue and renders one job at a time
```

- **One document drives everything.** The editor preview and the exported MP4 render the same `Main` component with the same validated document. Positions are percentages and sizes are measured against the 1080 px short side, so a project re-targets between 1920×1080 and 1080×1920.
- **Rendering never happens in the browser or inside Next.js.** The API only adds a job (with a snapshot of the document) to SQLite. The worker claims jobs atomically, bundles the compositions (and rebundles when their source changes), serves project assets to headless Chrome from a `127.0.0.1`-only file server, and writes MP4s to `data/renders/`. Cancelling stops a running render. Jobs left mid-render by a crash are queued again on restart. The UI warns when the worker isn't running.
- **Filesystem access is restricted.** Ids are validated before they become path segments. Every path is resolved and checked to stay inside its project or renders directory. Uploaded files are stored under generated names, never the user's file name. Files are only served if the database knows them for that project, with `nosniff` and a sandbox CSP. SVG isn't accepted.
- **Uploads are validated** by extension allowlist, magic bytes and size limits. Video and audio are also parsed with Mediabunny, so truncated or mislabelled media is rejected.

Data lives in `./data` (git-ignored). Set `STUDIO_DATA_DIR` to put it elsewhere.

## Tests

```bash
npm test             # unit + API tests (schema, timeline, animation, paths, uploads, queue, routes, theme)
npm run test:render  # end to end: seeds the example, bundles, renders real MP4s in both formats, verifies them
npm run typecheck
```

## Roadmap

Integrations planned for after the MVP, both optional and local:

- **Ollama**: draft scene copy, captions and template suggestions from a brief.
- **ComfyUI**: generate background stills and loops into the asset library.

## Licensing

Remotion is free for individuals and companies of up to three people. Larger companies need a [Remotion company licence](https://www.remotion.dev/license). The Anton font in `examples/` is under the SIL Open Font License (see `OFL-Anton.txt`). The other example assets were generated for this project.
