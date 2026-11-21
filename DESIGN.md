---
name: Spring AI from Scratch
description: An interactive Spring AI 2 course where the code is the spine of every page.
colors:
  spring-emerald: "#047857"
  spring-emerald-deep: "#065f46"
  spring-emerald-bright: "#34d399"
  spring-emerald-mid: "#10b981"
  paper: "#ffffff"
  night-slate: "#0f172a"
  ink: "#1e293b"
  ink-strong: "#0f172a"
  midnight: "#020617"
  ink-muted: "#475569"
  ink-quiet: "#64748b"
  rule: "#e2e8f0"
  rule-dark: "#1e293b"
  code-paper: "#f8fafc"
  code-night: "#1e293b"
  code-rule: "#e2e8f0"
  code-rule-dark: "#334155"
  latte-text: "#4c4f69"
  latte-green: "#40a02b"
  mocha-text: "#cdd6f4"
  mocha-green: "#a6e3a1"
typography:
  display:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.375rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
  numeral:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 300
    lineHeight: 1
    fontFeature: "tnum"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  gutter-phone: "16px"
  gutter: "24px"
  row: "8.8px"
  section: "64px"
  lesson-section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.spring-emerald}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.spring-emerald-deep}"
  button-primary-dark:
    backgroundColor: "{colors.spring-emerald-mid}"
    textColor: "{colors.midnight}"
  code-surface:
    backgroundColor: "{colors.code-paper}"
    textColor: "{colors.latte-text}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  code-surface-dark:
    backgroundColor: "{colors.code-night}"
    textColor: "{colors.mocha-text}"
  version-pill:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  sandbox-frame:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
  pill:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  pill-active:
    backgroundColor: "{colors.spring-emerald}"
    textColor: "{colors.paper}"
---

# Design System: Spring AI from Scratch

## Overview

**Creative North Star: "The Running Call"**

One call runs through the whole site. The home page opens with a request trace: one `ChatClient` call travelling from your service
through the advisor chain (memory, the tool loop, RAG) to `ChatModel` and the provider, then back as a typed `Answer`, with each step
labelled by the module that teaches it. A single pass runs the request out, round the tool loop once and back, and comes to rest on
`ChatClient`, where the course starts. The green band that marks the selected step also marks the key lines in every code file and
the changed lines in the provider switcher, so "this is the part that matters" looks the same everywhere on the site. Around the code, everything is quiet: white or slate-900 paper, slate prose in IBM Plex Sans, emerald used
only for links, the primary action and position in a sequence.

The density is that of good reference documentation: generous measure, clear section breaks, nothing decorative. Code surfaces
are the only saturated color on the page and they carry it fully (Catppuccin token colors: Latte, darkened where needed, on a
near-white box in light mode; Mocha on the slate-800 card color in dark mode), which keeps the emerald chrome from competing with
syntax colors.

The system rejects the generic course-site template: no gradient washes, no card grids for lists, no ALL-CAPS eyebrows, no
monospace used as a costume for small labels, no `→` on links, no `A · B · C` meta strings.

**Key Characteristics:**
- One visual language for "this line": a translucent green band with a 3px inset bar.
- Catppuccin code surfaces that follow the site theme; slate and emerald for everything else.
- JetBrains Mono only for real code; IBM Plex Sans for prose, labels and numerals.
- Numbers only for real sequences (modules, the four lesson parts), set light and tabular.
- Flat surfaces separated by hairline rules and tonal steps, not shadows.

## Colors

A cool slate neutral field with one emerald accent, and full Catppuccin color reserved for code.

### Primary
- **Spring Emerald** (#047857): links, the primary button, module numbers, the current lesson in the sidebar, the top edge of
  sandbox frames. Its dark-mode counterpart is **Bright Emerald** (#34d399).
- **Deep Emerald** (#065f46): primary button hover in light mode.

### Neutral
- **Paper** (#ffffff) and **Night Slate** (#0f172a): the page background in light and dark mode. Dark mode is slate-900, not a
  near-black.
- **Ink** (#1e293b): body text in light mode. **Ink Strong** (#0f172a) for headings.
- **Ink Muted** (#475569) and **Ink Quiet** (#64748b): ledes, summaries, secondary lines and "soon" states.
- **Rule** (#e2e8f0) and **Rule Dark** (#1e293b): hairline dividers between sections, modules and lesson parts.

### Code (Catppuccin)
- **Code Paper** (#f8fafc) with a Code Rule border (#e2e8f0) in light mode; **Code Night** (slate-800, #1e293b) with #334155 in
  dark mode. Token colors come from Catppuccin: Latte text #4c4f69 with every Latte color under 4.6:1 on Code Paper darkened in
  OKLCH, hue and chroma kept (`LATTE_DARKENED` in `shiki.config.mjs`: green #1f8400, peach #d13800, yellow #ac5e00, teal #007e85,
  sky #0078b5, comment grey #6d7084 and others); Mocha unchanged in dark mode. Exposed as `--code-*` variables in
  `src/styles/global.css`.
- **Line Green** (#40a02b light, #a6e3a1 dark): the highlight bar and the tint of the highlight band (13% and 12% alpha).
- **Answer Yellow** (`--syn-type`: #ac5e00 light, #f9e2af dark): the Catppuccin type color, used outside code only for the hero's
  return rail and its `Answer` end, because the reply comes back as that type. `--syn-comment` is the comment grey (404 page).

### Named Rules
**The One Accent Rule.** Emerald is the only chrome color. Amber, rose, sky and violet appear only as Gotcha kinds
(reliability, security, cost, migration), where the hue carries the meaning.

**The Code Owns Saturation Rule.** Syntax color lives inside code surfaces. Chrome around code stays slate so the two never
compete.

## Typography

**Body and display font:** IBM Plex Sans (400, 500, 600, 700), falling back to the system sans.
**Code font:** JetBrains Mono (400, 500, 600) with ligatures off, so `!=`, `->` and `>=` show exactly as typed. Code is never
italic, even where the Catppuccin theme asks for it (comments, some keywords).

**Character:** Plex is engineered and calm, close to the tooling the reader works in; JetBrains Mono is the IDE font many Java
developers already use, so code on the page looks like code in their editor.

### Hierarchy
- **Display** (600, 2.25rem on phones to 3.375rem, line-height 1.08): the home headline only, capped at 22ch.
- **Headline** (600, 1.875rem to 2.5rem, 1.1): the lesson title.
- **Title** (600, 1.5rem): section headings (home sections, lesson h2s such as "1. Spring mental model").
- **Body** (400, 1rem to 1.125rem for ledes, line-height about 1.75): lesson prose through the typography plugin, measure about
  65 to 75ch inside a max-w-3xl column.
- **Label** (500, 0.875rem): navigation, buttons, the module link above a lesson title, sandbox notes. Always sentence case.
- **Numeral** (300, 1.875rem to 2.25rem, tabular): module numbers and lesson-part numbers.
- **Code** (JetBrains Mono 400, 0.8rem, line-height 1.65): code files and sandbox code; inline code at 0.85em.

### Named Rules
**The Mono Is Code Rule.** JetBrains Mono appears only where the text is code, a file name, or a value the reader would type.
Small UI labels are Plex.

**The Sentence Case Rule.** Every heading, label, button and badge is sentence case. No tracked uppercase.

## Layout

- Home: a single left-aligned column up to 72rem (max-w-6xl) with 16px phone gutters and 24px from the sm breakpoint. Sections are
  separated by full-width hairline rules with 64px of vertical padding.
- The hero trace spans the full column. Below 48rem the steps run top to bottom on a left rail with the tool loop as a bracket on
  the right; from 48rem they sit in eight equal columns on two horizontal rails (outbound above, return below). The step detail
  sits under the trace, one column on phones and text beside code from 64rem.
- The course list is one vertical sequence, never a card grid. From the md breakpoint each module row is three columns:
  5rem numeral, up to 22rem title and summary, then the lessons.
- Lesson pages: a sticky 18rem sidebar from lg (a bottom sheet below lg), an article column capped at 48rem, and an
  "On this page" list from xl. Lesson h2s get 56px of space above, a top rule, and 32px below the rule. Each h2 has its reading
  time under it ("3 min read", small Ink Quiet) and right-aligned in the "On this page" list ("3 min").
- Wide tables and code scroll horizontally inside their column; the page itself never scrolls sideways. Table cells have a 9rem floor
  and the last (prose) column 17rem, so rows stay short and the clipped column signals that the table scrolls. These rules skip
  sandboxes (`.not-prose`): a sandbox table sizes its own columns and folds secondary columns into the main cell below `sm`.
- Diagrams run left to right: sequence diagrams for a call moving between components, horizontal flowcharts (`flowchart LR`)
  for pipelines, with labelled edges instead of decision diamonds. On desktop a diagram shrinks to fit the column; below 40rem
  it stops at 55% and scrolls inside its box.
- Every page starts with a "Skip to content" link that targets `#content` on the page's `main`.

## Elevation & Depth

The system is flat. Depth comes from tonal steps (paper, then code mantle, then code base) and hairline borders. The only
blur is the sticky header's translucent backdrop, which keeps scrolled content legible behind it. Gotcha callouts carry an
extra-small shadow; nothing else is lifted.

### Named Rules
**The Flat By Default Rule.** Don't add shadows to separate content. Use a rule, a tonal step or space.

## Shapes

Gently rounded and consistent by role: 6px on buttons, pills, code boxes and the copy button, 8px on callouts, 12px on sandbox
frames, the outermost container. The version pill is the one fully round shape. Borders are 1px slate hairlines; the sandbox frame's top edge is a 2px emerald line that marks it as
interactive. Gotchas keep a 4px colored left edge because the hue encodes the gotcha kind.

## Components

### Buttons
- **Shape:** gently rounded (6px).
- **Primary:** Spring Emerald with white label text, 10px by 20px, semibold 0.875rem. In dark mode the fill is Mid Emerald
  (#10b981) with slate-950 (#020617) text.
- **Hover / focus:** the fill steps one shade (deeper in light mode, brighter in dark). Focus is a 2px emerald outline with a 2px
  offset.
- **Secondary:** a text link with a quiet underline (4px offset) whose decoration turns emerald on hover. No arrows.

### Pills (sandbox toggles)
- **Style:** 1px slate border, 6px radius, monospace text because their labels are code (`chatClient.prompt()`).
- **State:** the active pill is filled emerald (dark mode: a 20% emerald tint with light emerald text) and sets `aria-pressed`.

### Code file
- **Title line:** above the box, outside it: the file path in mono (medium, slate-700; a path that doesn't fit is cut on the left,
  so the file name always shows) and, on the right, an icon-only copy button
  (32px, transparent border that appears on hover, muted icon). After a copy the icon turns into an emerald check for 1.5s and a
  screen-reader status says "Copied". No window dots, no language badge.
- **Box:** Code Paper or Code Night, 1px Code Rule border, 6px radius, 12px vertical padding, 0.8rem/1.65 JetBrains Mono, no
  ligatures, no italics. Scrollbars use the code palette (gutter-colored thumb on the code background).
- **Lines:** CSS-counter line numbers in the gutter color, never copied. Key lines get the green band and a green number.
- **Folding:** a file of 25 lines or more with key lines opens folded (`src/lib/code-fold.mjs`): its key lines with 3 lines
  around each, and every hidden run of 4 or more lines becomes one gap row, "⋯ N lines" in Plex xs in the gutter color between
  dashed Code Rule hairlines, aligned with the code. A gap row opens its run (hover turns its text green); "Show full file", a
  quiet underlined xs text button left of the copy button ("Full file" on phones), opens them all and becomes "Show key lines". Gap rows reset the line
  counter, so numbers stay true, and carry no text, so copy still copies the whole file. Reading time counts only the visible lines.
- **Sandboxes:** `CodeView` uses the same box at the same size; the provider switcher uses the same title line and copy button.

### Project tree
- **Place:** first thing under every lesson's "## 3." heading (`<ProjectTree />`), above the first code file.
- **Closed by default:** a `<details>` card in the code box colours (Code Rule border, 6px radius) whose summary is one line: a
  chevron that turns 90° when open (no turn under reduced motion), "The project after this lesson" in the code-file title style and
  "N of M files are in this lesson" in muted xs text (on the right on desktop, under the title on a phone). Open, a Code Rule line
  separates the summary from the tree, which starts with "Linked files jump to their code below; muted files are unchanged."
- **Tree:** 0.8rem mono in the code palette, no line numbers and no copy button.
  Each level is a Code Rule left guide; a source root (`src/main/java/com/example/support/`, `src/main/resources/`) is one line.
- **Files:** a file the lesson shows is an emerald underlined link to its code block, followed by a small "new" (emerald) or
  "changed" (muted) mark. Every other file is muted. A directory with nothing the lesson shows folds into a `<details>` line with
  its file count. Long names wrap at capitals and slashes with a hanging indent, so the box never scrolls sideways.

### Sandbox frame
- **Corner style:** 12px, 1px slate border with a 2px emerald top edge, white (dark: slate-800 at 40%).
- **Header:** the sandbox title, the note "Simulated in your browser, no API key needed", and a one-line how-to.
- **Inside:** fieldsets, pills, a resolution table and a `CodeView` on the code surface.

### Gotcha
- **Style:** an 8px callout with a 4px left edge in the kind's hue and a small sentence-case badge (Reliability, Security, Cost,
  1.x → 2.0).
- **More gotchas:** a lesson shows its three most important gotchas (security and money first) and folds the rest into
  `MoreGotchas`: a closed `<details>` with an 8px slate hairline, a chevron that turns 90° (none under reduced motion) and
  "More gotchas (N)" as a medium sm label; open, a hairline separates the summary from the gotchas. Reading time leaves them out.

### Navigation
- **Header:** sticky, 3.5rem, translucent paper with backdrop blur. The menu button (lesson pages, below lg) and the logo on the
  left; the version pill and the theme toggle on the right. The pill is a 1px slate outline, fully round, 0.75rem medium Plex with
  tabular figures, reading `v1.0.37` on a deploy and `dev` on any other build.
- **Sidebar:** modules with tabular numbers, lessons in a 1px rail. The current lesson takes an emerald rail segment and emerald
  text. Unwritten lessons are muted with an italic lowercase "soon". A deep-dive lesson carries a muted xs "Deep dive" on the
  right (also after its title in the home course list, explained once above it), and its header adds one muted sentence; core
  lessons carry no mark.
- **Course sheet (below lg):** the header's menu button opens the sidebar as a bottom sheet on a modal `<dialog>`: paper,
  a 1px top hairline, 12px top corners, no shadow, a 50% slate-950 scrim, at most 85dvh. A grab bar and "Course contents"
  with a close button head it; dragging that head down past a quarter of its height (at most 120px) closes it, as do the
  scrim, Escape and following a section link. Modules are `<details>` and only the current one starts open; rows are 8px
  taller than on desktop for touch. The current lesson lists its sections with reading times on its emerald rail, so phones
  get "On this page" too. It slides in over 240ms, not at all under reduced motion.

### The request trace (signature)
The home hero (`HeroTrace.astro`), a tab list of the steps of one request. Steps follow the real 2.0.2 default advisor order:
your service, `ChatClient`, chat memory (+200), the tool loop (`ToolCallingAdvisor`, +300), RAG (0), `ChatModel`, the provider, and
back as `Answer` at the far end of the return rail.
- **Steps:** a node on the rail, a Plex label and "Module N" below it. Hover, focus and the selected step take the green band
  (bottom bar on wide screens, left bar on phones); the selected node fills emerald.
- **Rails:** 2px slate. The outbound rail fills emerald and the return rail Answer Yellow as the pass reaches them; they stay
  filled afterwards to show the completed trip. The tool loop is a dashed arc over tool loop, RAG and `ChatModel`, labelled
  "repeats for each tool call", lit while the pass goes round it.
- **Detail:** the selected step's name and real type, one or two sentences, a link to its module (marked "lessons coming soon"
  when unwritten) and its code in the standard code box without line numbers, highlighted at build time.
- **Motion:** one pass of 170ms steps after a 400ms pause, then it rests on `ChatClient`. Skipped under reduced motion, and ended
  at once by pointing at the trace or selecting a step. Arrow keys, Home and End move between steps.

## Do's and Don'ts

### Do:
- **Do** mark the important line with the green band and inset bar, wherever code appears.
- **Do** keep emerald for links, the primary action, module numbers and the current position.
- **Do** set numbers in Plex with tabular figures, and only for real sequences.
- **Do** write every label in sentence case and every link as the thing it opens.
- **Do** let tables and code scroll inside their column on phones.
- **Do** render titles (lesson, prev/next, home list, sidebar, gotcha) through `Breakable`, so a long CamelCase name such as
  `RetrievalAugmentationAdvisor` wraps at its capitals instead of running off a phone screen.
- Zoom is off on phones by the owner's decision (viewport `user-scalable=no`, `touch-action: pan-x pan-y`, Safari `gesturestart`
  cancelled), although it fails WCAG 1.4.4 for readers who enlarge text. Keep body text at 1rem or more for that reason.
- **Do** show JSON indented, two spaces, one key per line, everywhere: sandboxes format it through `prettyJson`
  (`src/lib/json-format.ts`, which keeps number text such as `59.90`), and lines never wrap (each field keeps its own line; the box scrolls sideways). JSON that
  Jackson writes (`"key" : value`) stays as Jackson writes it, and log lines stay on one line.
- **Do** let inline code break anywhere (`overflow-wrap: anywhere`, background cloned per line): a long API name in prose must
  never widen the page.
- **Do** rely on the shared browser-surface tokens in `global.css`: a 2px emerald focus ring (`--focus-ring`) with a 2px
  offset on every focusable element, emerald text selection, emerald form-control accents and slate scrollbars.

### Don't:
- **Don't** use ALL-CAPS tracked eyebrow labels above headings.
- **Don't** use monospace for small UI labels; mono is for code.
- **Don't** append `→` to links or buttons, or join meta with middle dots.
- **Don't** lay out lists as card grids or add gradient washes.
- **Don't** use a near-black dark background; dark mode is slate-900.
- **Don't** add fake window chrome (dots, title bars) to code or sandboxes.
- **Don't** set code in italics or turn ligatures on.
