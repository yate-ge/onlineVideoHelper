(() => {
  "use strict";

  const MIN_SCALE = 1;
  const MAX_SCALE = 6;
  const ZOOM_STEP = 0.0016;
  const RESET_EPSILON = 0.002;
  const DRAG_THRESHOLD_PX = 4;
  const PLAYER_CONTROL_SELECTOR = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='slider']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='menuitem']",
    "[role='tab']",
    "[aria-valuenow]",
    "[contenteditable='true']",
    ".ytp-progress-bar",
    ".ytp-progress-bar-container"
  ].join(",");
  const STYLE_PROPS = [
    "transform",
    "transform-origin",
    "transition",
    "will-change"
  ];

  const originalStyles = new WeakMap();

  let activeVideo = null;
  let zoom = createZoomState();
  let drag = null;
  let suppressClickUntil = 0;
  let pointerSequenceActive = false;

  function createZoomState() {
    return {
      scale: 1,
      x: 0,
      y: 0,
      baseRect: null
    };
  }

  function onWheel(event) {
    const video = findTargetVideo(event);
    if (!video) {
      if (activeVideo) resetActiveVideo();
      return;
    }

    takeOver(event);
    activateVideo(video);

    const delta = normalizeWheelDelta(event);
    const nextScale = clamp(
      zoom.scale * Math.exp(-delta * ZOOM_STEP),
      MIN_SCALE,
      MAX_SCALE
    );

    if (nextScale <= MIN_SCALE + RESET_EPSILON) {
      resetZoomOnly();
      return;
    }

    ensureBaseRect(video);

    const contentX = (event.clientX - zoom.baseRect.left - zoom.x) / zoom.scale;
    const contentY = (event.clientY - zoom.baseRect.top - zoom.y) / zoom.scale;

    zoom.scale = nextScale;
    zoom.x = event.clientX - zoom.baseRect.left - contentX * zoom.scale;
    zoom.y = event.clientY - zoom.baseRect.top - contentY * zoom.scale;

    clampPan();
    applyZoomStyle(video);
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;

    if (pointerSequenceActive) {
      if (isPlayerControlEvent(event)) return;
      stopPageEvent(event);
      return;
    }

    const video = findTargetVideo(event);
    if (!video || video !== activeVideo || zoom.scale <= MIN_SCALE) return;
    if (isPlayerControlEvent(event)) {
      pointerSequenceActive = false;
      return;
    }

    drag = createDragState(event, null);
    stopPageEvent(event);
  }

  function onMouseMove(event) {
    if (pointerSequenceActive) {
      stopPageEvent(event);
      return;
    }

    updateDrag(event);
  }

  function onMouseUp(event) {
    if (pointerSequenceActive) {
      stopPageEvent(event);
      return;
    }

    finishDrag(event);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !event.isPrimary) return;

    const video = findTargetVideo(event);
    if (!video || video !== activeVideo || zoom.scale <= MIN_SCALE) return;
    if (isPlayerControlEvent(event)) {
      pointerSequenceActive = false;
      return;
    }

    pointerSequenceActive = true;
    drag = createDragState(event, event.pointerId);
    stopPageEvent(event);
  }

  function onPointerMove(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateDrag(event);
  }

  function onPointerUp(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishDrag(event);
    releasePointerSequenceAfterCompatibilityEvents();
  }

  function onPointerCancel(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopPageEvent(event);
    drag = null;
    releasePointerSequenceAfterCompatibilityEvents();
  }

  function createDragState(event, pointerId) {
    return {
      pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: zoom.x,
      startY: zoom.y,
      active: false
    };
  }

  function isPlayerControlEvent(event) {
    const fullscreenRoot = getFullscreenElement();
    if (!fullscreenRoot) return false;

    const path =
      typeof event.composedPath === "function"
        ? event.composedPath()
        : buildEventPath(event.target, fullscreenRoot);

    for (const node of path) {
      if (node === fullscreenRoot) break;
      if (
        node instanceof Element &&
        typeof node.matches === "function" &&
        node.matches(PLAYER_CONTROL_SELECTOR)
      ) {
        return true;
      }
    }

    return false;
  }

  function buildEventPath(target, root) {
    const path = [];
    let node = target;

    while (node) {
      path.push(node);
      if (node === root) break;
      node = node.parentNode || (node.host ? node.host : null);
    }

    return path;
  }

  function updateDrag(event) {
    if (!drag || !activeVideo) return;

    if (!isVideoInCurrentFullscreen(activeVideo)) {
      resetActiveVideo();
      return;
    }

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;

    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
        stopPageEvent(event);
        return;
      }
      drag.active = true;
    }

    takeOver(event);
    zoom.x = drag.startX + dx;
    zoom.y = drag.startY + dy;
    clampPan();
    applyZoomStyle(activeVideo);
  }

  function finishDrag(event) {
    if (!drag) return;

    const wasDragging = drag.active;
    drag = null;

    stopPageEvent(event);

    if (wasDragging) {
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = performance.now() + 250;
    }
  }

  function releasePointerSequenceAfterCompatibilityEvents() {
    setTimeout(() => {
      pointerSequenceActive = false;
    }, 0);
  }

  function onClick(event) {
    if (!activeVideo || zoom.scale <= MIN_SCALE) return;
    if (!isVideoInCurrentFullscreen(activeVideo)) {
      resetActiveVideo();
      return;
    }
    if (performance.now() <= suppressClickUntil) {
      takeOver(event);
      suppressClickUntil = 0;
    }
  }

  function onFullscreenChange() {
    resetActiveVideo();
  }

  function onResize() {
    resetActiveVideo();
  }

  function activateVideo(video) {
    if (activeVideo === video) return;
    resetActiveVideo();
    activeVideo = video;
    zoom = createZoomState();
  }

  function resetZoomOnly() {
    if (!activeVideo) return;
    restoreStyles(activeVideo);
    zoom = createZoomState();
    drag = null;
    suppressClickUntil = 0;
    pointerSequenceActive = false;
  }

  function resetActiveVideo() {
    if (activeVideo) {
      restoreStyles(activeVideo);
    }
    activeVideo = null;
    zoom = createZoomState();
    drag = null;
    suppressClickUntil = 0;
    pointerSequenceActive = false;
  }

  function findTargetVideo(event) {
    const fullscreenRoot = getFullscreenElement();
    if (!fullscreenRoot) return null;
    return findBestVideo(fullscreenRoot, event);
  }

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function findBestVideo(root, event) {
    const videos = collectVideos(root).filter(isUsableVideo);
    if (!videos.length) return null;

    let bestVideo = null;
    let bestScore = -Infinity;

    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const containsPointer = pointInRect(event.clientX, event.clientY, rect);
      const area = rect.width * rect.height;
      let score = area;

      if (containsPointer) score += Number.MAX_SAFE_INTEGER / 4;
      if (!video.paused) score += Number.MAX_SAFE_INTEGER / 8;
      if (video === activeVideo) score += Number.MAX_SAFE_INTEGER / 16;

      if (score > bestScore) {
        bestScore = score;
        bestVideo = video;
      }
    }

    return bestVideo;
  }

  function collectVideos(root, out = []) {
    if (!root) return out;

    if (root instanceof HTMLVideoElement) {
      out.push(root);
    }

    if (typeof root.querySelectorAll === "function") {
      try {
        root.querySelectorAll("video").forEach((video) => out.push(video));
      } catch (_) {
        // Some browser-created fullscreen nodes can reject selectors.
      }
    }

    if (typeof root.querySelectorAll === "function") {
      try {
        root.querySelectorAll("*").forEach((element) => {
          if (element.shadowRoot) {
            collectVideos(element.shadowRoot, out);
          }
        });
      } catch (_) {
        // Selector access can fail for browser-owned fullscreen nodes.
      }
    }

    return out;
  }

  function isUsableVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!video.isConnected) return false;

    const rect = video.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 45) return false;
    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
      return false;
    }

    const style = window.getComputedStyle(video);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;

    return video.videoWidth > 0 || video.readyState > 0 || !video.paused;
  }

  function isVideoInCurrentFullscreen(video) {
    const fullscreenRoot = getFullscreenElement();
    if (!fullscreenRoot || !video || !video.isConnected) return false;

    let node = video;
    while (node) {
      if (node === fullscreenRoot) return true;
      if (
        typeof fullscreenRoot.contains === "function" &&
        fullscreenRoot.contains(node)
      ) {
        return true;
      }

      const rootNode =
        typeof node.getRootNode === "function" ? node.getRootNode() : null;
      node = rootNode && rootNode.host ? rootNode.host : null;
    }

    return false;
  }

  function ensureBaseRect(video) {
    if (zoom.baseRect) return;
    zoom.baseRect = rectToPlainObject(video.getBoundingClientRect());
  }

  function clampPan() {
    if (!zoom.baseRect || zoom.scale <= MIN_SCALE) return;

    const rootRect = getViewportRect();
    const scaledWidth = zoom.baseRect.width * zoom.scale;
    const scaledHeight = zoom.baseRect.height * zoom.scale;

    if (scaledWidth <= rootRect.width) {
      zoom.x =
        rootRect.left +
        (rootRect.width - scaledWidth) / 2 -
        zoom.baseRect.left;
    } else {
      const minX = rootRect.right - zoom.baseRect.left - scaledWidth;
      const maxX = rootRect.left - zoom.baseRect.left;
      zoom.x = clamp(zoom.x, minX, maxX);
    }

    if (scaledHeight <= rootRect.height) {
      zoom.y =
        rootRect.top +
        (rootRect.height - scaledHeight) / 2 -
        zoom.baseRect.top;
    } else {
      const minY = rootRect.bottom - zoom.baseRect.top - scaledHeight;
      const maxY = rootRect.top - zoom.baseRect.top;
      zoom.y = clamp(zoom.y, minY, maxY);
    }
  }

  function applyZoomStyle(video) {
    rememberStyles(video);
    video.style.setProperty("transform-origin", "0 0", "important");
    video.style.setProperty("transition", "none", "important");
    video.style.setProperty("will-change", "transform", "important");
    video.style.setProperty(
      "transform",
      `translate3d(${zoom.x.toFixed(2)}px, ${zoom.y.toFixed(2)}px, 0) scale(${zoom.scale.toFixed(4)})`,
      "important"
    );
  }

  function rememberStyles(video) {
    if (originalStyles.has(video)) return;

    const snapshot = new Map();
    for (const prop of STYLE_PROPS) {
      snapshot.set(prop, {
        value: video.style.getPropertyValue(prop),
        priority: video.style.getPropertyPriority(prop)
      });
    }

    originalStyles.set(video, snapshot);
  }

  function restoreStyles(video) {
    const snapshot = originalStyles.get(video);
    if (!snapshot) return;

    for (const [prop, saved] of snapshot) {
      if (saved.value) {
        video.style.setProperty(prop, saved.value, saved.priority);
      } else {
        video.style.removeProperty(prop);
      }
    }

    originalStyles.delete(video);
  }

  function normalizeWheelDelta(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * window.innerHeight;
    }
    return event.deltaY;
  }

  function getViewportRect() {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function rectToPlainObject(rect) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function takeOver(event) {
    if (event.cancelable) event.preventDefault();
    stopPageEvent(event);
  }

  function stopPageEvent(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  window.addEventListener("wheel", onWheel, {
    capture: true,
    passive: false
  });
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  window.addEventListener("pointercancel", onPointerCancel, { capture: true });
  window.addEventListener("mousedown", onMouseDown, { capture: true });
  window.addEventListener("mousemove", onMouseMove, { capture: true });
  window.addEventListener("mouseup", onMouseUp, { capture: true });
  window.addEventListener("click", onClick, { capture: true });
  window.addEventListener("resize", onResize, { capture: true });
  window.addEventListener("pagehide", resetActiveVideo, { capture: true });
  document.addEventListener("fullscreenchange", onFullscreenChange, {
    capture: true
  });
  document.addEventListener("webkitfullscreenchange", onFullscreenChange, {
    capture: true
  });
})();
