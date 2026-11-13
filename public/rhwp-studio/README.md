# Vendored rhwp Studio runtime

This directory contains a pinned browser build of
[`edwardkim/rhwp`](https://github.com/edwardkim/rhwp).

- Version: `v0.7.19`
- Source commit: `f137b4c9468eaff5bb43e25108e9c9d39a2ed15b`
- Build base: `/rhwp-studio/`
- Application entry: `/rhwp-studio/index.html`
- Included package: `@rhwp/core@0.7.19`
- SPACEKIJUN extension capabilities: `spacekijun-ai-edit-v1`,
  `spacekijun-ai-template-v1`, `spacekijun-ai-nested-table-v1`

The runtime is served from the same origin as SPACEKIJUN so private HWPX files
can be transferred directly from the authenticated browser to the editor
iframe. The upstream sample documents and PWA service worker are intentionally
excluded. Refresh this directory only from the pinned upstream tag, and keep
`LICENSE` and `THIRD_PARTY_LICENSES.md` with the build.

The SPACEKIJUN build adds four same-origin embed RPC methods:
`getAiEditingContext`, `replaceAiEditingTarget`, `getAiFillableFields`, and
`applyAiFieldValues`. They capture a text cursor, selection, or ClickHere field
snapshot and reject an apply request when that target changed after draft
generation. Replacements run as one snapshot command so each user-approved
apply is reversible with one undo.

The Studio quick-action bar also adds an `AI` field button immediately after
line spacing (`Ctrl+Alt+A`, or `Command+Option+A` on macOS). It converts the
current selection, insertion point, or an existing ClickHere field into a
persistent AI-enabled template field. The field memo stores a
`SPACEKIJUN_AI_WORK_V1` marker and the author's field-specific instruction.
`getAiFillableFields` exposes that metadata as `isAiWorkField` and
`aiInstruction` without leaking the storage marker to the host.

AI cursor insertion, selection replacement, and AI work-field creation also
support nested table cells. A selection may span paragraphs in the same final
cell; selections crossing cell boundaries remain rejected.

When refreshing from upstream, port this extension in `core/types.ts`,
`engine/input-handler.ts`, `ui/ai-work-field-dialog.ts`,
`command/commands/insert.ts`, `command/shortcut-map.ts`, `index.html`,
`styles/style-bar.css`, `styles/dialogs.css`, `embed/protocol.ts`,
`embed/rpc-router.ts`, and `main.ts` before rebuilding.
