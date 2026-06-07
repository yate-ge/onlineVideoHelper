const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const extensionPath = repoRoot.replace(/\\/g, "/");
const outputDir = path.join(repoRoot, ".tmp", "playwright", "site-fullscreen");
const profileDir = path.join(outputDir, `profile-${Date.now()}`);

const sites = [
  {
    name: "youtube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    shortcut: "f"
  },
  {
    name: "bilibili",
    url: "https://www.bilibili.com/video/BV1GJ411x7h7/",
    shortcut: "f"
  }
];

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.stack || error) }, null, 2));
  process.exit(1);
});

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const context = await launchWithExtension();
  await context.addInitScript({
    content: `
      window.findLargestVideo = () => {
        const videos = Array.from(document.querySelectorAll("video"));
        let bestVideo = null;
        let bestArea = 0;

        for (const video of videos) {
          const rect = video.getBoundingClientRect();
          const visible =
            rect.width >= 80 &&
            rect.height >= 45 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth &&
            getComputedStyle(video).display !== "none" &&
            getComputedStyle(video).visibility !== "hidden";
          const area = rect.width * rect.height;

          if (visible && area > bestArea) {
            bestArea = area;
            bestVideo = video;
          }
        }

        return bestVideo;
      };
    `
  });
  const page = await context.newPage();

  try {
    const results = [];

    for (const site of sites) {
      results.push(await verifySite(page, site));
    }

    const ok = results.every((result) => result.ok);
    console.log(JSON.stringify({ ok, results }, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

async function launchWithExtension() {
  return await chromium.launchPersistentContext(profileDir, {
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1280, height: 720 },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-default-browser-check",
      "--no-first-run"
    ]
  });
}

async function verifySite(page, site) {
  const startedAt = Date.now();
  const failures = [];
  let details = {};

  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await dismissCommonDialogs(page);
    await waitForUsableVideo(page);
    await prepareVideo(page);
    await enterFullscreen(page, site.shortcut);

    details.fullscreen = await page.evaluate(() => ({
      hasFullscreenElement: Boolean(document.fullscreenElement),
      fullscreenTag: document.fullscreenElement ? document.fullscreenElement.tagName : null,
      fullscreenClass: document.fullscreenElement ? document.fullscreenElement.className : null
    }));

    if (!details.fullscreen.hasFullscreenElement) {
      failures.push("could not enter DOM fullscreen");
    }

    const before = await getVideoTransformState(page);
    await installEventProbe(page);
    await zoomAtVideoCenter(page);
    const afterWheel = await getVideoTransformState(page);
    const probeAfterWheel = await getEventProbe(page);

    await resetEventProbe(page);
    await clickZoomedVideo(page);
    const probeAfterClick = await getEventProbe(page);

    await resetEventProbe(page);
    await dragZoomedVideo(page);
    const afterDrag = await getVideoTransformState(page);
    const probeAfterDrag = await getEventProbe(page);

    details = {
      ...details,
      url: page.url(),
      before,
      afterWheel,
      afterDrag,
      probeAfterWheel,
      probeAfterClick,
      probeAfterDrag,
      elapsedMs: Date.now() - startedAt
    };

    if (!afterWheel.inlineTransform.includes("scale(")) {
      failures.push("wheel did not apply a zoom transform");
    }

    if (afterWheel.inlineTransform === afterDrag.inlineTransform) {
      failures.push("drag did not change the zoom transform");
    }

    if (probeAfterWheel.counts.wheel !== 0) {
      failures.push(`wheel reached page listener ${probeAfterWheel.counts.wheel} time(s)`);
    }

    if (probeAfterClick.counts.click === 0) {
      failures.push("ordinary click did not reach page listener while zoomed");
    }

    for (const type of ["mousemove", "mouseup", "click"]) {
      const count = probeAfterDrag.counts[type];
      if (count !== 0) {
        failures.push(`${type} reached page listener ${count} time(s) during drag`);
      }
    }
  } catch (error) {
    failures.push(String(error.stack || error));
  } finally {
    await exitFullscreen(page);
  }

  return {
    site: site.name,
    ok: failures.length === 0,
    failures,
    details
  };
}

async function dismissCommonDialogs(page) {
  const labels = [
    /accept all/i,
    /reject all/i,
    /i agree/i,
    /agree/i,
    /同意/,
    /接受/,
    /知道了/,
    /我知道了/,
    /继续/,
    /关闭/
  ];

  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    try {
      if (await button.isVisible({ timeout: 1000 })) {
        await button.click({ timeout: 3000 });
        await page.waitForTimeout(800);
      }
    } catch (_) {
      // Dialogs vary by region and account state.
    }
  }

  await page.keyboard.press("Escape").catch(() => {});
}

async function waitForUsableVideo(page) {
  await page.waitForFunction(
    () => {
      const videos = Array.from(document.querySelectorAll("video"));
      return videos.some((video) => {
        const rect = video.getBoundingClientRect();
        return (
          rect.width >= 200 &&
          rect.height >= 120 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < innerHeight &&
          rect.left < innerWidth
        );
      });
    },
    null,
    { timeout: 90000 }
  );
}

async function prepareVideo(page) {
  await page.evaluate(async () => {
    const video = findLargestVideo();
    if (!video) throw new Error("No video element found");
    video.muted = true;
    video.volume = 0;
    try {
      await video.play();
    } catch (_) {
      // Site controls may still require a click; dimensions are enough for this test.
    }
  });

  const center = await getVideoCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(1200);
}

async function enterFullscreen(page, shortcut) {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  const center = await getVideoCenter(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);

  if (shortcut) {
    await page.keyboard.press(shortcut);
    await page.waitForTimeout(1800);
  }

  if (await isFullscreen(page)) return;

  await clickFullscreenButton(page);
  await page.waitForTimeout(1800);

  if (await isFullscreen(page)) return;

  await page.evaluate(async () => {
    const video = findLargestVideo();
    const target = video && (video.closest("#movie_player, .bpx-player-container, .bilibili-player, .player, [class*='player']") || video);
    if (!target) throw new Error("No fullscreen target found");
    const request =
      target.requestFullscreen ||
      target.webkitRequestFullscreen ||
      target.mozRequestFullScreen ||
      target.msRequestFullscreen;
    if (!request) throw new Error("Fullscreen API is not available");
    await request.call(target);
  }).catch(() => {});

  await page.waitForTimeout(1800);
}

async function clickFullscreenButton(page) {
  const selectors = [
    ".ytp-fullscreen-button",
    "button[aria-label*='Full screen']",
    "button[title*='Full screen']",
    ".bpx-player-ctrl-full",
    ".bilibili-player-video-btn-fullscreen",
    "[class*='fullscreen']"
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    try {
      if (await locator.isVisible({ timeout: 1200 })) {
        await locator.click({ timeout: 3000 });
        return;
      }
    } catch (_) {
      // Continue with the next site-specific selector.
    }
  }
}

async function isFullscreen(page) {
  return await page.evaluate(() => Boolean(document.fullscreenElement)).catch(() => false);
}

async function installEventProbe(page) {
  await page.evaluate(() => {
    window.__ovhProbe = {
      counts: {
        wheel: 0,
        mousedown: 0,
        mousemove: 0,
        mouseup: 0,
        click: 0
      }
    };

    for (const type of Object.keys(window.__ovhProbe.counts)) {
      window.addEventListener(
        type,
        () => {
          window.__ovhProbe.counts[type] += 1;
        },
        { capture: true }
      );
    }
  });
}

async function getEventProbe(page) {
  return await page.evaluate(() => window.__ovhProbe);
}

async function resetEventProbe(page) {
  await page.evaluate(() => {
    for (const type of Object.keys(window.__ovhProbe.counts)) {
      window.__ovhProbe.counts[type] = 0;
    }
  });
}

async function zoomAtVideoCenter(page) {
  const center = await getVideoCenter(page);
  await page.mouse.move(center.x, center.y);
  await resetEventProbe(page);
  await page.mouse.wheel(0, -280);
  await page.waitForTimeout(700);
}

async function clickZoomedVideo(page) {
  const center = await getVideoCenter(page);
  await page.mouse.move(center.x, center.y);
  await resetEventProbe(page);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(700);
}

async function dragZoomedVideo(page) {
  const center = await getVideoCenter(page);
  await page.mouse.move(center.x, center.y);
  await resetEventProbe(page);
  await page.mouse.down();
  await page.mouse.move(center.x - 90, center.y - 50, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

async function getVideoCenter(page) {
  return await page.evaluate(() => {
    const video = findLargestVideo();
    if (!video) throw new Error("No video element found");
    const rect = video.getBoundingClientRect();
    return {
      x: Math.max(1, Math.min(innerWidth - 2, rect.left + rect.width / 2)),
      y: Math.max(1, Math.min(innerHeight - 2, rect.top + rect.height / 2))
    };
  });
}

async function getVideoTransformState(page) {
  return await page.evaluate(() => {
    const video = findLargestVideo();
    if (!video) throw new Error("No video element found");
    const rect = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    return {
      inlineTransform: video.style.transform,
      computedTransform: style.transform,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    };
  });
}

async function exitFullscreen(page) {
  await page.evaluate(async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }).catch(() => {});
  await page.waitForTimeout(800).catch(() => {});
}
