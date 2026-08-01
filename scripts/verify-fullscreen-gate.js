const path = require("path");
const { chromium } = require("playwright");

const contentScriptPath = path.resolve(__dirname, "..", "content.js");

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    await page.setContent(`
      <style>
        html, body {
          overflow: hidden;
          margin: 0;
          width: 100%;
          height: 100%;
        }
        #player {
          position: relative;
          overflow: hidden;
          width: 100%;
          height: 100%;
        }
        video { display: block; width: 100%; height: 100%; }
        #seek {
          position: absolute;
          right: 40px;
          bottom: 10px;
          left: 40px;
          height: 20px;
        }
      </style>
      <div id="player">
        <video></video>
        <div id="seek" class="bpx-player-progress-area">
          <div class="bpx-player-progress-wrap"></div>
        </div>
      </div>
      <div id="other"></div>
    `);

    await page.evaluate(() => {
      window.__fullscreenRoot = null;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => window.__fullscreenRoot
      });

      const video = document.querySelector("video");
      Object.defineProperty(video, "readyState", {
        configurable: true,
        get: () => 1
      });
    });

    await page.addScriptTag({ path: contentScriptPath });

    const nonFullscreen = await dispatchWheel(page);
    assert(!nonFullscreen.defaultPrevented, "non-fullscreen wheel was captured");
    assert(!nonFullscreen.transform, "non-fullscreen video was transformed");

    await page.evaluate(() => {
      window.__fullscreenRoot = document.querySelector("#other");
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    const unrelatedFullscreen = await dispatchWheel(page);
    assert(
      !unrelatedFullscreen.defaultPrevented,
      "video wheel was captured while an unrelated element was fullscreen"
    );
    assert(
      !unrelatedFullscreen.transform,
      "video was transformed while an unrelated element was fullscreen"
    );

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.__fullscreenRoot = document.querySelector("#player");
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    const fullscreen = await dispatchWheel(page);
    assert(fullscreen.defaultPrevented, "fullscreen wheel was not captured");
    assert(
      fullscreen.transform.includes("scale("),
      "fullscreen video was not transformed"
    );

    await installPointerProbe(page);
    await page.mouse.click(640, 360);
    const clickProbe = await readPointerProbe(page);
    assert(clickProbe.pointerdown === 0, "pointerdown reached the page");
    assert(clickProbe.mousedown === 0, "mousedown reached the page");
    assert(clickProbe.pointerup === 0, "pointerup reached the page");
    assert(clickProbe.mouseup === 0, "mouseup reached the page");
    assert(clickProbe.click === 1, "ordinary click did not reach the page");

    await page.waitForTimeout(10);
    await page.mouse.move(640, 360);
    await resetPointerProbe(page);
    await page.mouse.down();
    await page.mouse.move(560, 320, { steps: 4 });
    await page.mouse.up();
    const dragProbe = await readPointerProbe(page);
    for (const [type, count] of Object.entries(dragProbe)) {
      assert(
        count === 0,
        `${type} reached the page during a drag: ${JSON.stringify(dragProbe)}`
      );
    }

    await resetPointerProbe(page);
    await page.mouse.click(640, 700);
    const controlAfterDragProbe = await readPointerProbe(page);
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      assert(
        controlAfterDragProbe[type] === 1,
        `${type} did not reach the player control immediately after a drag`
      );
    }

    await page.evaluate(() => {
      window.__fullscreenRoot = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    const afterExit = await dispatchWheel(page);
    assert(!afterExit.defaultPrevented, "wheel was captured after leaving fullscreen");
    assert(!afterExit.transform, "video transform remained after leaving fullscreen");

    console.log("Fullscreen gate verification passed.");
  } finally {
    await browser.close();
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error.message).includes("Executable doesn't exist")) throw error;
    return await chromium.launch({ channel: "chrome", headless: true });
  }
}

async function dispatchWheel(page) {
  return await page.evaluate(() => {
    const video = document.querySelector("video");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: innerWidth / 2,
      clientY: innerHeight / 2,
      deltaY: -280
    });

    video.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      transform: video.style.transform
    };
  });
}

async function installPointerProbe(page) {
  await page.evaluate(() => {
    window.__pointerProbe = {};
    for (const type of [
      "pointerdown",
      "mousedown",
      "pointermove",
      "mousemove",
      "pointerup",
      "mouseup",
      "click"
    ]) {
      window.__pointerProbe[type] = 0;
      window.addEventListener(
        type,
        () => {
          window.__pointerProbe[type] += 1;
        },
        { capture: true }
      );
    }
  });
}

async function resetPointerProbe(page) {
  await page.evaluate(() => {
    for (const type of Object.keys(window.__pointerProbe)) {
      window.__pointerProbe[type] = 0;
    }
  });
}

async function readPointerProbe(page) {
  return await page.evaluate(() => ({ ...window.__pointerProbe }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
