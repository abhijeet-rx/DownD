# downD Frontend Polish Brief

This document is the implementation brief for a full visual and interaction polish of downD. It describes the current product, the intended design direction, required behavior, constraints, and completion criteria. Treat the existing resume and LaTeX workflows as working product behavior that must be preserved while improving the frontend.

## Product summary

downD is a browser-based LaTeX resume tailoring workspace. Users keep a resume source in the editor, paste a job description into an on-demand matcher, review detected skills, add skills to the resume's existing LaTeX skill categories, compile locally, and inspect the PDF preview. There is no authentication. Resume code and custom skills persist in this browser.

## Current implementation

- `src/main.tsx` contains the app state, skill matching and LaTeX insertion logic, local persistence, compiler flow, and most page markup.
- `src/style.css` contains the visual system and responsive layout. It currently has compact/minified rules and multiple later overrides for the same selectors and breakpoints; consolidate these as part of the polish.
- `src/PdfViewer.tsx` renders the compiled PDF with page navigation, zoom, fit-width, and optional thumbnails.
- CodeMirror provides LaTeX editing, syntax highlighting, lint markers, line numbers, and scrolling.
- The main workspace has a source editor and PDF preview side by side. The skills library and JD field live in a modal opened by “Tailor to a job description.”
- The JD matcher handles a large categorized catalog plus user-added custom technologies. Matching and compilation happen locally.
- The editor header includes the file name, Reset default, Upload .tex, and Copy code. Reset restores the saved baseline; uploading a resume updates that baseline.
- Compilation supports pdfLaTeX, XeLaTeX, and Auto, with a local compile console and actionable diagnostics.
- The default LaTeX starter is a structured resume template with contact details, summary, skill rows, experience, projects, and education.

## Goal

Make the entire app feel like a carefully designed, reliable resume-production tool: calm, focused, professional, and easy to understand on first use. Preserve the LaTeX-first workflow. The source editor and rendered resume are the main surfaces; JD tailoring should be easy to find without taking permanent space from the workbench.

## Visual direction

Use a restrained editorial workspace style rather than a generic dashboard or marketing landing page.

- Keep the existing forest-green brand as the primary action color. Use warm white/off-white workspace surfaces, dark readable text, quiet neutral borders, and amber only for JD-required or attention states.
- Use consistent spacing, radius, border, and elevation tokens. Prefer thin borders and subtle surface separation over multiple shadows or decorative gradients.
- Establish a clear type hierarchy: compact application chrome, readable panel titles, highly legible editor text, and calm secondary metadata. Load or bundle fonts intentionally; do not rely on undeclared fonts appearing on the user's machine.
- Keep all interface text concise and action-oriented. Use icons only when their meaning is clear; provide accessible names for icon-only buttons.
- Give interactive controls consistent hover, focus-visible, pressed, disabled, and loading states.

### Suggested design tokens

Treat these as a starting point and tune them consistently during implementation:

| Token | Suggested value | Use |
|---|---:|---|
| `--color-ink` | `#1F2923` | Main text |
| `--color-muted` | `#68756C` | Secondary text |
| `--color-canvas` | `#F4F6F2` | Page background |
| `--color-surface` | `#FFFFFF` | Panels and dialogs |
| `--color-border` | `#DDE4DC` | Dividers and control borders |
| `--color-primary` | `#176247` | Primary actions and brand |
| `--color-primary-hover` | `#104D38` | Primary hover |
| `--color-primary-soft` | `#EAF3EC` | Selected/resume-present state |
| `--color-jd` | `#B97834` | JD-required state |
| `--color-danger` | `#B94E43` | Errors and destructive confirmation |
| `--radius-sm/md/lg` | `6 / 10 / 14px` | Controls, panels, dialogs |
| `--space-*` | 4px scale | Consistent layout rhythm |

Keep color contrast at WCAG AA for normal text and controls.

## Page and component requirements

### 1. Application header

- Keep the downD mark/name visible and compact.
- Show a clear local-save indicator with a meaningful state: saved, saving, or save error. Do not show a success badge if persistence has failed.
- Keep the header aligned with the workspace container and avoid excessive top-page whitespace.

### 2. Workspace intro and primary action

- Keep a short page title and one-line explanation; reduce the current hero-like vertical footprint so the workbench occupies most of the initial viewport.
- Make “Tailor to a job description” the clear primary action. Show the number of currently selected JD skills when useful.
- Do not introduce authentication, onboarding gates, account navigation, or unrelated dashboard widgets.

### 3. Main workbench

- Desktop: present the LaTeX editor and PDF preview as two adjacent, equal-priority panels. A starting split around 52% editor / 48% preview is appropriate. Keep both visible at common laptop widths without horizontal page scrolling.
- Make the workbench use available viewport height while retaining minimum usable panel heights. Avoid fixed heights that clip the console, controls, or PDF.
- Give editor and preview panels distinct but coordinated headers, compact toolbars, and clear panel boundaries.
- Consider a draggable split divider with a keyboard-accessible alternative. If a resizer is not included, make the editor/preview widths adapt sensibly at each breakpoint.
- Keep the JD library out of the permanent desktop grid.

### 4. Resume editor panel

- Keep CodeMirror as the editor; preserve syntax highlighting, line numbers, active-line feedback, lint markers, keyboard shortcuts, and full vertical/horizontal scrolling.
- Make the file name secondary metadata. Group source actions so Reset default, Upload .tex, and Copy code do not crowd the panel title. On narrow widths, move lower-priority actions into a labeled overflow menu or compact icon buttons with tooltips and accessible names.
- Keep the compile engine selector and Compile action visible and easy to locate.
- Make the compile console collapsible or adjustable so users can trade console height for code. Errors should show a concise message and line number first, with the full log available on demand.
- Make editor focus, selection, cursor, and diagnostic states high contrast without distracting from code.
- Preserve the reset behavior: the default baseline is the starter template until a resume is uploaded; an uploaded resume becomes the reset baseline. Reset must be clearly labeled and confirm before discarding edits.

### 5. PDF preview panel

- Keep the custom PDF viewer and its existing page navigation, thumbnail toggle, zoom, fit-width, and download/open actions.
- Style the toolbar to match the app while retaining the dark document canvas as a visual distinction from the white page.
- Keep controls readable at narrow widths; collapse low-priority controls before allowing the toolbar to overflow.
- Distinguish “waiting for first compile,” “compiling,” “up to date,” “showing previous successful output,” and “compile failed.”
- Empty preview should offer a direct Compile action and a short explanation. Loading and PDF parse errors need their own readable states.

### 6. JD matcher and skill library modal

- Keep the modal as the single entry point for JD tailoring and manual library edits.
- Use a clear top-to-bottom flow: paste JD → review detected skills and any new technologies → apply to resume. Keep the searchable categorized library available below or beside this flow.
- Visually distinguish skills already in the resume, skills required by the current JD, and skills newly detected from the JD. Do not make these states rely on color alone; retain checkmarks, labels, and accessible names.
- Keep bulk Apply action visible while the skill results scroll. Report how many skills were found, already present, added, or added as custom library entries.
- Allow adding a technology that is not in the catalog and make the persistence of custom skills clear.
- Keep search, skill groups, and results usable with a large catalog. Provide empty, no-match, detection, and error states.
- Support Escape to close, a visible close button, backdrop click to close, focus containment while open, and restoring focus to the opener after close. Prevent the background page from scrolling while the dialog is open.
- On mobile, make the dialog a full-screen sheet with a sticky header and sticky Apply action; let its internal content scroll.

### 7. Responsive behavior

Use content-driven breakpoints and verify at least these viewport classes:

- Wide desktop: `>= 1280px`: editor and preview side by side with full controls.
- Laptop/tablet landscape: `900–1279px`: preserve both work areas; tighten panel chrome and toolbar spacing before hiding useful controls.
- Tablet/mobile: `< 900px`: use a segmented Editor / Preview switcher or stacked panels with clear navigation. Prefer a switcher on phones so users do not need to scroll past a full-height editor to reach the PDF.
- Small phone: `<= 420px`: prevent header/action wrapping, maintain readable touch targets, and keep modal inputs/actions inside the viewport.

At every width, prevent accidental document-level horizontal scrolling. Use internal scrolling for CodeMirror, PDF pages, modal skill results, and compile logs.

### 8. Accessibility and interaction quality

- Use semantic landmarks and heading order. Label every input and textarea; use real buttons for actions.
- Add visible `:focus-visible` styles and ensure the full interface is keyboard-operable.
- Use `aria-pressed` or checkbox semantics for toggles; expose skill state to screen readers.
- Announce save, compile, and JD-apply results through restrained live regions.
- Respect `prefers-reduced-motion`; transitions must never be required to understand state.
- Keep minimum touch targets around 40–44px on mobile, even when desktop controls are compact.
- Ensure errors are not communicated only through red color, and required skills are not communicated only through amber.

## Suggested component organization

The current page implementation is concentrated in `src/main.tsx`. During the polish, separate presentation components where it improves clarity, while keeping source manipulation, compiler lifecycle, and persistence behavior stable. A reasonable structure is:

```text
src/
  components/
    AppHeader.tsx
    WorkspaceIntro.tsx
    ResumeEditorPanel.tsx
    CompileConsole.tsx
    PdfPreviewPanel.tsx
    JobMatcherDialog.tsx
    SkillLibrary.tsx
    ConfirmDialog.tsx
  styles/
    tokens.css
    global.css
    workspace.css
    modal.css
  main.tsx
  PdfViewer.tsx
```

Do not split files only to increase file count. Keep shared application state and business rules in a small, understandable app layer; keep visual components focused on rendering and user events. Avoid adding a UI framework or icon library unless a concrete gap justifies the dependency.

## Preserve these product behaviors

- No authentication requirement.
- Resume source, default baseline, filename, selected JD skills, and custom skills persist locally in the same browser.
- Uploading a `.tex` resume updates the baseline used by Reset default.
- JD detection applies skills to the existing Skills section and matching category rows when possible; it must not append skills to the bottom of the document.
- Manual skill changes and JD bulk apply remain available.
- The browser-based LaTeX compiler and PDF preview remain local and functional.
- Reset default restores the original baseline and clears stale JD selections without deleting custom library entries.
- Keep existing keyboard shortcuts and add new shortcuts only when they do not conflict with CodeMirror or browser behavior.

## Implementation sequence

1. Audit the existing selectors and component state; write down any behavior that must remain unchanged.
2. Consolidate the CSS into named tokens and component rules. Remove duplicate override blocks instead of layering another patch at the end.
3. Refine the desktop workbench hierarchy, panel sizing, editor header actions, compile console, and PDF toolbar.
4. Polish the JD dialog and large skill list, including loading, empty, matched, selected, custom-skill, and feedback states.
5. Implement tablet and phone layouts and keyboard/accessibility behavior.
6. Review all states at wide, laptop, tablet, and phone widths; correct overflow and clipping.
7. Run the existing production build and manually inspect the core workflows described below.

## Acceptance criteria

- The initial screen immediately communicates “edit LaTeX, tailor to a JD, compile, preview.”
- The editor and PDF preview both remain usable on desktop without either feeling squeezed or dominant.
- The JD modal is easy to open and close, works by keyboard, and remains usable with hundreds of skills.
- Upload, copy, reset, bulk JD apply, individual skill add/remove, compile, page zoom/navigation, and PDF download remain discoverable and work as before.
- A user can tell the current resume save state, compile state, PDF freshness, and JD application result without reading raw logs.
- The interface works at desktop, tablet, and phone widths without clipped actions or page-level horizontal scrolling.
- All controls have visible focus, sufficient contrast, meaningful accessible names, and understandable disabled/loading states.
- The CSS no longer depends on a chain of duplicated late overrides for core layout behavior.
- `npm run build` succeeds after the frontend work.

## Ready-to-use AI implementation prompt

> Polish the complete downD frontend using `FRONTEND_POLISH_BRIEF.md` as the source of truth. First inspect the existing React/TypeScript app and preserve its current product behavior: local resume persistence, uploaded-resume reset baseline, LaTeX skill insertion into existing category rows, the JD modal and custom skills, CodeMirror editing, local LaTeX compilation, diagnostics, and PDF viewing. Then implement the visual system, desktop workbench, modal, responsive layouts, and accessibility requirements in the brief. Consolidate `src/style.css`; do not append another layer of overrides. Keep the product LaTeX-first, avoid auth/account features, and do not replace the compiler, editor, or PDF viewer. Run `npm run build`, then inspect the main interactions and responsive states. Report files changed, behavior preserved, build result, and any unresolved limitations.
