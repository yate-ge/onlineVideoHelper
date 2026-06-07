# Online Video Helper

A minimal Chrome extension for fullscreen online videos.

## Features

- Works in fullscreen video playback.
- Uses the mouse wheel to zoom the video around the pointer position.
- Supports left-click dragging while zoomed in.
- Captures the same mouse actions before the page's own player handlers.
- Adds no popup, controls, overlay, hint text, or visible UI.

## Install

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Choose `Load unpacked`.
4. Select this project folder.

## Use

Open any online video, enter fullscreen, then:

- Wheel up to zoom in.
- Wheel down to zoom out.
- Left-click and drag to pan when zoomed in.

## Verify

The real-site check covers fullscreen playback on YouTube and Bilibili:

```sh
npm install
npm run test:sites
```
