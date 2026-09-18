# Online Video Helper

A minimal Chrome extension for fullscreen online videos.

## Features

- Works only while a video is in browser fullscreen (Fullscreen API) playback.
- Uses the mouse wheel to zoom the video around the pointer position.
- Supports left-click dragging while zoomed in.
- Keeps native HTML video controls usable while zoomed in.
- Supports Chrome's built-in player for video files in fullscreen, using media
  cropping so Chrome's fullscreen transform restriction does not block zoom.
- Captures drag pointer and mouse actions before the page's own player handlers.
- Adds no popup, controls, overlay, hint text, or visible UI.

## Install

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Choose `Load unpacked`.
4. Select this project folder.
5. Open the extension's details and enable `Allow access to file URLs` to use
   local video files opened directly in Chrome.

## Use

Open any online video, enter fullscreen, then:

- Wheel up to zoom in.
- Wheel down to zoom out.
- Left-click and drag to pan when zoomed in.

Local video files opened with a `file://` URL use the same controls. Chrome
requires `Allow access to file URLs` to be enabled for the extension first.

The extension does not activate for embedded videos, theater modes, or players
that merely cover the browser viewport without entering real browser fullscreen.

## Verify

The local regression check verifies that viewport-covering videos are ignored
outside browser fullscreen and activated inside it. It also opens a generated
local WebM in Chrome's native media document and checks real fullscreen zoom,
pan, the native play button, and reset. This checks the content script, not the
extension installation or the user's file access setting:

```sh
npm install
npm test
```

The optional real-site check covers fullscreen playback on YouTube and Bilibili:

```sh
npm install
npm run test:sites
```
