# Image Generation and Local Editing

Use this reference to select the smallest workflow when the user only wants to generate or process images. `repochan image gen` uses a configured image endpoint. `repochan image edit` performs deterministic local pixel operations and does not require image-generation credentials. Default pixel operations ship with the CLI. Optional ML background removal downloads its model only after an explicit install and runs offline afterward.

## Contents

- [Execution boundaries](#execution-boundaries)
- [Generate images](#generate-images)
- [Local image-edit commands](#local-image-edit-commands)
- [Common recipes](#common-recipes)
- [Validate and deliver](#validate-and-deliver)

## Execution boundaries

1. Identify the input files and the requested output directory, formats, and dimensions. Proceed directly when the context makes them unambiguous.
2. Do not overwrite existing files by default. Pass `--overwrite` only when the user has explicitly authorized replacement.
3. Direct processing of ordinary files does not require `repochan init` and must not write `.repochan/`. Direct generation is only for scratch output that the user explicitly wants outside the protocol. A formal asset in an initialized project requires an approved order and Painter delivery.
4. Published order-result `versions/` directories and their `meta.json` files are immutable. When an input comes from an order result, write derived assets to a user-selected directory or the assembled site's `public/` directory.
5. Painter generates and publishes source order assets; it must not use image-edit to rewrite delivered results. Use `repochan starter asset-apply` for site-specific derivation. Without a site, use `repochan order extract <id>` when extraction should enter the order's append-only derived audit. Call `repochan image edit` directly only for standalone asset work or pixel-operation debugging.
6. Quote paths that contain spaces. Prefer `--json` when an agent needs to parse output; retain text output when the user needs to observe the process.

## Generate images

### Configure and diagnose

```bash
repochan image status
repochan image probe [--endpoint <id>]
repochan image configure
```

- If no endpoint is configured, ask the user to run `repochan image configure` in their terminal. Never request or echo an API key in chat.
- `configure --provider codex` reuses `codex login` and does not start a separate OAuth flow.
- `configure --provider openai` uses the OpenAI API. `--provider custom` configures a compatible endpoint.
- Normally omit `--mode` and keep the endpoint default at `auto`. Use `openai` or `openai-async` only when diagnosing a confirmed synchronous or asynchronous compatibility issue.
- `probe` checks connectivity without running a billed image generation.

### Generate

```bash
repochan image gen \
  --prompt "<complete prompt>" \
  [--reference "<path>"]... \
  [--out "<path>"] \
  [--endpoint <id>] \
  [--aspect landscape|square|portrait] \
  [--size <WxH|2K|4K>] \
  [--quality low|medium|high|auto]
```

Pass every reference image with a separate `--reference`:

```bash
repochan image gen --prompt "..." \
  --reference "character.png" \
  --reference "composition.png" \
  --aspect square
```

Generation may take several minutes. Run only one instance of the same request at a time. If an error includes `jobId` or `billedRisk`, inspect the endpoint job or completed outputs before resubmitting the same prompt. Without `--out`, the CLI writes the result under `~/.cache/repochan/` and returns an absolute path.

## Local image-edit commands

Every command reads ordinary image files and writes to an explicit or derived path. Existing targets fail by default. Confirm the replacement scope before using `--overwrite`.

| Task | Command |
| --- | --- |
| Check or install optional ML | `repochan image edit ml status` / `repochan image edit ml install` |
| Preview or slice a grid | `repochan image edit slice <img> --rows N --cols M [--out <dir>] [--padding N] [--name-template "tile-{i}.png"]` |
| Validate seamless textures | `repochan image edit validate-seams <img> [--threshold 0..1] [--out <board.png>]` |
| Remove a background with local ML | `repochan image edit bg-remove <img> [--out <png>] [--model small|medium]` |
| Remove a solid matte | `repochan image edit chroma-key <img> [--out <png>] [--matte auto|#hex|name] [--pipeline v2|v1]` |
| Extract a semantic grid | `repochan image edit extract <img> --rows N --cols M --mapping <keys> --normalize N --out <dir> [--strategy ...]` |
| Convert an icon sheet to SVGs | `repochan image edit iconfont <sheet> --rows N --cols M --mapping <keys> --out <dir> [--view-box N]` |
| Generate a grid composition guide | `repochan image edit layout-guide --rows N --cols M --out <guide.png>` |
| Create multi-size PNGs | `repochan image edit resize <img> --sizes 16,32,48,180,512 --out <dir> [--fit inside|cover|contain|fill]` |
| Create a multi-resolution ICO | `repochan image edit favicon <img> [--out <favicon.ico>] [--sizes 16,32,48,256]` |
| Convert or compress a format | `repochan image edit compress <img> [--out <path>] [--format webp|jpeg|avif|png] [--quality N] [--max-width N]` |
| Encode frames as a GIF | `repochan image edit gif-from-frames <f1> <f2> ... [--out <gif>] [--fps N|--delay ms[,ms...]] [--loop N]` |

### Choose a background-removal method

- Use `chroma-key` for a uniform green, magenta, cyan, white, or other known solid matte. It is fast and reproducible.
- Use `bg-remove` for a complex or unknown background. If the CLI returns `REPOCHAN_IMAGE_ML_MISSING`, run `repochan image edit ml install` once and retry the original command unchanged. Stop and report the failure if installation fails; do not loop installation.
- For a regular solid-matte grid that needs named transparent files, use the default `extract` strategy `chroma-grid` with pipeline `v2`, a row-major `--mapping`, and `--normalize`.
- For regular rectangular crops without a matte, use `slice`, or use `extract --strategy equal-cell` only when extraction without alpha is acceptable.
- `ml-blobs` and `hybrid` require optional ML. `hybrid` also requires an explicit `--ml-fallback`. Do not preinstall ML for a normal regular grid.

### Extract a semantic grid

Use this default path:

```bash
repochan image edit extract "sheet.png" \
  --rows 3 \
  --cols 3 \
  --mapping idle,happy,sad,angry,thinking,loading,success,error,welcome \
  --normalize 512 \
  --out "dist/states"
```

- `--mapping` defines row-major semantic keys. Alternatively, pass a key array or `{ "key": cellIndex }` object with `--mapping-file`.
- Named outputs require `--normalize <canvas-size>`. Add `--padding N` when the output needs inner padding.
- `--matte auto|#hex` controls the matte color. `--matte-select corner|subject-aware` controls automatic matte selection.
- Select `--format png|webp` as needed. If structured QA fails, inspect `defects[]` and correct the input or generation; do not bypass the check.

### Convert an icon sheet to SVG

`iconfont` converts a regular solid-matte icon sheet into individual SVG files, `sprite.svg`, and `index.json`:

```bash
repochan image edit iconfont "icons-sheet.png" \
  --rows 4 \
  --cols 4 \
  --mapping home,search,settings,user,star,heart,download,upload,play,pause,next,prev,plus,minus,check,close \
  --normalize 512 \
  --view-box 24 \
  --out "dist/icons-svg"
```

### Slice grids and validate seams

- Without `--out`, `slice` returns a coordinate preview and writes no files. Confirm the grid before adding an output directory.
- If the grid contains gutters or borders, use `--padding` to inset each cell's crop bounds.
- Use `validate-seams` for seamless textures. After the numeric check passes, still inspect the generated 3×3 board for a central hotspot, repeated text, or strong directionality.

## Common recipes

### New icon to multi-size PNG and ICO

```bash
repochan image edit resize "icon.png" \
  --sizes 16,32,48,64,128,180,192,256,512 \
  --out "dist/icons"

repochan image edit favicon "icon.png" \
  --sizes 16,32,48,256 \
  --out "dist/favicon.ico"
```

If the source is not square, determine whether the user wants to preserve its aspect ratio or crop it to a square. `resize` preserves the aspect ratio by default. `favicon` uses square targets with `inside` fit, so prefer a square source for predictable composition and padding. Retain PNG as the source format for transparent icons.

### Generate an icon and derive outputs immediately

```bash
repochan image gen \
  --prompt "single centered app icon, transparent-friendly silhouette, no text" \
  --aspect square \
  --size 1024x1024 \
  --out "work/icon-source.png"

repochan image edit resize "work/icon-source.png" \
  --sizes 32,64,128,256,512 \
  --out "public/icons"

repochan image edit favicon "work/icon-source.png" \
  --out "public/favicon.ico"
```

If the generated image still has a background, run `chroma-key` or `bg-remove` according to the background type, then derive every size from the transparent result.

### Compress a large web image

```bash
repochan image edit compress "hero.png" \
  --format webp \
  --quality 82 \
  --max-width 2560 \
  --out "public/hero.webp"
```

Retain the original as the source asset and write the compressed result to the consuming directory. Do not select JPEG when transparency must be preserved.

### Split a sticker sheet

```bash
repochan image edit extract "sheet.png" \
  --rows 3 \
  --cols 3 \
  --mapping hello,happy,sad,angry,thinking,loading,success,error,welcome \
  --normalize 512 \
  --out "dist/stickers"
```

Inspect every output for transparent-edge quality, semantic order, dimensions, and lost fine lines. Use `slice` instead when regular crops do not need background removal.

### Encode animation frames as a GIF

```bash
repochan image edit gif-from-frames \
  "frames/01.png" "frames/02.png" "frames/03.png" \
  --fps 12 \
  --loop 0 \
  --out "dist/preview.gif"
```

Keep frame dimensions consistent. For unequal frame durations, use `--delay 100,100,250` instead of relying on `--fps` to infer timing.

## Validate and deliver

After execution, report at least:

- the source files and actual output paths;
- the number, formats, and dimensions of generated files;
- whether any existing files were overwritten;
- the inspection result for transparency, crops, compression, or animation loops;
- any skipped operation, missing input, or original CLI error.

Do not stop after suggesting commands. When the user has authorized the work and the inputs are unambiguous, execute the matching commands and inspect the outputs.
