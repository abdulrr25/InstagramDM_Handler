// One hand-written stylesheet, served at /styles.css. Dense, small type,
// restrained colour — colour is used only for route pills. A tool for
// scanning, not a landing page.
export const STYLES = `
:root {
  --bg: #fbfbfa;
  --panel: #ffffff;
  --line: #e7e7e4;
  --ink: #1c1c1a;
  --muted: #6b6b66;
  --faint: #9a9a94;
  --accent: #2f6feb;
  --row-hover: #f4f4f2;
  font-size: 13px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17171a;
    --panel: #1f1f23;
    --line: #2e2e34;
    --ink: #e9e9e6;
    --muted: #a0a09a;
    --faint: #6f6f6a;
    --accent: #6aa0ff;
    --row-hover: #26262b;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.4;
}

header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  padding: 10px 16px;
}

.masthead {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.masthead h1 { font-size: 14px; margin: 0; font-weight: 600; }
.masthead .sub { color: var(--faint); font-size: 12px; }

nav.tabs { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
nav.tabs a {
  text-decoration: none;
  color: var(--muted);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
}
nav.tabs a:hover { background: var(--row-hover); }
nav.tabs a.active {
  color: var(--ink);
  background: var(--row-hover);
  border-color: var(--line);
  font-weight: 600;
}
nav.tabs a .count { color: var(--faint); font-variant-numeric: tabular-nums; }

.keyhint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--faint);
}
.keyhint kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--row-hover);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 11px;
}

main { padding: 0 0 40px; }

.list { list-style: none; margin: 0; padding: 0; }

form.row {
  display: block;
  margin: 0;
  border-bottom: 1px solid var(--line);
}
form.row > details > summary {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  list-style: none;
}
form.row > details > summary::-webkit-details-marker { display: none; }
form.row > details > summary:hover { background: var(--row-hover); }
form.row > details[open] > summary { background: var(--row-hover); }

.who { min-width: 0; }
.who .handle { font-weight: 600; font-size: 12.5px; }
.who .handle .verified { color: var(--accent); }
.who .meta { color: var(--faint); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.snippet {
  min-width: 0;
  color: var(--ink);
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.snippet .labeled-as { color: var(--faint); font-size: 11px; }

.verdict { display: flex; align-items: center; gap: 8px; justify-self: end; text-align: right; }
.verdict .reason {
  color: var(--muted);
  font-size: 11px;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.verdict .conf { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }

.pill {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--muted);
  background: var(--panel);
  white-space: nowrap;
}
.pill-lead    { color: #0a7d3f; background: #e7f6ec; border-color: #b9e3c7; }
.pill-support { color: #1c56c9; background: #e8effc; border-color: #c2d5f6; }
.pill-maybe   { color: #9a6a00; background: #fcf3e0; border-color: #f0dcae; }
.pill-noise   { color: #6b6b66; background: #f0f0ee; border-color: #dededa; }
.pill-unknown { color: #b02a2a; background: #fceaea; border-color: #f3c9c9; }
.pill-none    { color: var(--faint); background: transparent; border-style: dashed; }

@media (prefers-color-scheme: dark) {
  .pill-lead    { color: #7bd9a2; background: #123322; border-color: #1f5236; }
  .pill-support { color: #9cc0ff; background: #16233f; border-color: #294066; }
  .pill-maybe   { color: #e6bd6a; background: #33280f; border-color: #574417; }
  .pill-noise   { color: #b8b8b2; background: #26262b; border-color: #35353b; }
  .pill-unknown { color: #f19a9a; background: #3a1c1c; border-color: #5c2b2b; }
}

.detail { padding: 4px 16px 16px 226px; }
.detail .full { white-space: pre-wrap; font-size: 13px; margin: 0 0 12px; }
.detail dl.sender {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 2px 12px;
  margin: 0 0 12px;
  font-size: 12px;
}
.detail dl.sender dt { color: var(--faint); }
.detail dl.sender dd { margin: 0; }
.detail details.raw { margin-top: 8px; }
.detail details.raw summary { cursor: pointer; color: var(--muted); font-size: 12px; }
.detail pre.raw {
  margin: 8px 0 0;
  padding: 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
}

.label-actions { display: flex; gap: 5px; flex-wrap: nowrap; justify-self: end; }
.label-actions button {
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
}
.label-actions button:hover { background: var(--row-hover); border-color: var(--muted); }
.label-actions button .k {
  color: var(--faint);
  font-size: 9.5px;
  margin-left: 4px;
}
.label-actions button.current {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.empty { padding: 40px 16px; color: var(--muted); font-size: 13px; }
.empty a { color: var(--accent); }

/* Narrow windows: reflow the dense row into three stacked bands instead of
   letting the four columns overflow. Sender + verdict share the top band,
   the message gets its own line, and the label buttons wrap along the bottom. */
@media (max-width: 820px) {
  form.row > details > summary {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "who     verdict"
      "snippet snippet"
      "actions actions";
    row-gap: 6px;
    align-items: center;
  }
  form.row > details > summary > .who { grid-area: who; }
  form.row > details > summary > .snippet {
    grid-area: snippet;
    white-space: normal;       /* free to wrap now it has its own line */
  }
  form.row > details > summary > .verdict { grid-area: verdict; }
  form.row > details > summary > .label-actions {
    grid-area: actions;
    justify-self: start;
    flex-wrap: wrap;           /* buttons wrap rather than overflow */
  }
  /* The reason is the biggest space hog and least useful when cramped. */
  .verdict .reason { display: none; }
  /* Drop the desktop indent that aligned detail under the sender column. */
  .detail { padding-left: 16px; }
}
`;
