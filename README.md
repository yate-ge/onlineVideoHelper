# Online Video Helper

A minimal Chrome extension for fullscreen online videos.

## Features

- Works only while a video is in browser fullscreen (Fullscreen API) playback.
- Uses the mouse wheel to zoom the video around the pointer position.
- Supports left-click dragging while zoomed in.
- Captures drag pointer and mouse actions before the page's own player handlers.
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

The extension does not activate for embedded videos, theater modes, or players
that merely cover the browser viewport without entering real browser fullscreen.

## Verify

The local regression check verifies that viewport-covering videos are ignored
outside browser fullscreen and activated inside it:

```sh
npm install
npm test
```

The optional real-site check covers fullscreen playback on YouTube and Bilibili:

```sh
npm install
npm run test:sites
```
