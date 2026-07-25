# Project Guide

## Architecture

This is a build-free static Netlify site. `index.html` owns document structure, `assets/styles.css` owns the complete responsive visual system, and `assets/app.js` owns all application state and Three.js behavior. External runtime dependencies are loaded from CDNs before the application script.

## Key Directories

- `assets/` contains all first-party browser assets.
- `.netlify/` contains Netlify agent output and must not be used for public application assets.

## Conventions

- Keep first-party JavaScript compatible with classic scripts; avoid modules and syntax that requires transpilation.
- Prefer `var`, function expressions, and broadly supported DOM APIs because browser reach is a core requirement.
- Treat camera and MediaPipe support as optional progressive enhancement. Mouse and touch interactions must remain fully functional when AI dependencies fail.
- Keep application state inside the existing IIFE to avoid adding globals.
- Preserve the industrial toy-workbench visual direction and existing CSS custom properties.
- Use Indonesian for user-facing interface copy and English for maintenance documentation.

## Non-obvious Decisions

- Three.js r128 is intentionally loaded as a classic global script to avoid module compatibility and bundling requirements.
- The WebGL capability check replaces the application with a useful browser message instead of failing silently.
- Import files accept both the current `{ version, bricks }` shape and the original array-only export format.
- The project has no build step; Netlify publishes the repository root directly.
