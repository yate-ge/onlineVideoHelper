# Changelog

## 0.1.3 - 2026-09-18

- Fix zoom and pan for video files opened directly in Chrome and played in
  fullscreen. Use media cropping because Chrome's fullscreen styles disable
  transforms on the fullscreen video element.
- Keep native playback controls at their original size and preserve interaction
  with the bottom control area while zoomed in.
- Restore media styles when zoom is reset or fullscreen is exited.
- Document the required file URL access permission for local videos.
- Add a generated WebM fixture and a real native-fullscreen regression check for
  zoom, pan, the native play button, and reset alongside the fullscreen gate test.

Validation: `npm test` passes. The native test runs the content script in a real
Chrome media document; it does not test extension installation or permission grants.
