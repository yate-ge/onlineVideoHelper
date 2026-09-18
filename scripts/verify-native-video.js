const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      if (!error.message.includes("Executable doesn't exist")) throw error;
      browser = await chromium.launch({ channel: "chrome", headless: true });
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // Small generated test pattern, with no network or runtime encoder needed.
    const file = path.join(__dirname, "fixtures", "native-video.webm");
    await page.goto(pathToFileURL(file).href);
    // Exercise the content script in Chrome's real media document. Extension
    // installation and the user-controlled file access grant are prerequisites.
    await page.addScriptTag({ path: path.resolve(__dirname, "..", "content.js") });
    const video = page.locator("video");
    await video.evaluate((v) => {
      v.muted = true;
      return v.play();
    });
    await page.waitForFunction(() => document.querySelector("video").videoWidth > 0);
    await video.evaluate((element) => element.pause());
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -280);
    await page.waitForTimeout(100);
    assert.equal(await video.evaluate((v) => v.style.objectViewBox), "");

    await video.evaluate((element) => element.requestFullscreen());
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -280);
    await page.waitForFunction(() => getComputedStyle(document.querySelector("video")).objectViewBox !== "none");
    const zoomed = await video.evaluate((v) => ({
      crop: getComputedStyle(v).objectViewBox,
      transform: getComputedStyle(v).transform,
      width: v.getBoundingClientRect().width
    }));
    assert.equal(zoomed.transform, "none", "real native fullscreen must exercise the UA transform restriction");
    assert.equal(zoomed.width, 1280, "native controls container must remain viewport-sized");

    await page.mouse.down();
    await page.mouse.move(540, 300, { steps: 4 });
    await page.mouse.up();
    const panned = await video.evaluate((v) => getComputedStyle(v).objectViewBox);
    assert.notEqual(panned, zoomed.crop, "drag must pan the media crop");

    // A real click on Chrome's native play button, immediately after dragging.
    await page.mouse.click(26, 672);
    await page.waitForFunction(() => !document.querySelector("video").paused);
    await video.evaluate((v) => v.pause());
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, 2000);
    await page.waitForFunction(() => document.querySelector("video").style.objectViewBox === "");
    await page.mouse.wheel(0, -280);
    await page.waitForFunction(() => document.querySelector("video").style.objectViewBox !== "");
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => document.querySelector("video").style.objectViewBox === "");
    assert.equal(await video.evaluate((v) => v.style.objectFit), "");
    console.log("Native file video: real fullscreen, zoom, pan, native play button and reset passed.");
  } finally {
    if (browser) await browser.close();
  }
}
