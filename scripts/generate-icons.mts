// Génère les icônes PNG de la PWA à partir des SVG de public/icons (rendu par Chromium / Playwright).
//   pnpm icons
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const TARGETS = [
  { svg: "public/icons/icon.svg", out: "public/icons/icon-192.png", size: 192, background: "transparent" },
  { svg: "public/icons/icon.svg", out: "public/icons/icon-512.png", size: 512, background: "transparent" },
  { svg: "public/icons/icon-maskable.svg", out: "public/icons/icon-maskable-512.png", size: 512, background: "#0E5A3A" },
  // iOS n'accepte pas la transparence : fond vert de la marque.
  { svg: "public/icons/icon-maskable.svg", out: "public/icons/apple-touch-icon.png", size: 180, background: "#0E5A3A" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { svg, out, size, background } of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  const markup = readFileSync(svg, "utf8").replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<html><body style="margin:0;background:${background}">${markup}</body></html>`);
  await page.screenshot({ path: out, omitBackground: background === "transparent" });
  console.log(`${out} (${size}×${size})`);
}
await browser.close();
