const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const cssPath = path.join(root, "assets", "shared.css");
const jsPath = path.join(root, "assets", "app.js");
const html = fs.readFileSync(indexPath, "utf8");

const styleMatches = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)];
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];

if (styleMatches.length !== 1 || scriptMatches.length !== 1) {
  throw new Error(
    `Expected one inline style and one inline script, found ${styleMatches.length} and ${scriptMatches.length}.`
  );
}

const css = `${styleMatches[0][1].trim()}\n`;
const js = `${scriptMatches[0][1].trim()}\n`;
const nextHtml = html
  .replace(styleMatches[0][0], '<link rel="stylesheet" href="assets/shared.css">')
  .replace(scriptMatches[0][0], '<script src="assets/app.js"></script>');

fs.writeFileSync(cssPath, css, "utf8");
fs.writeFileSync(jsPath, js, "utf8");
fs.writeFileSync(indexPath, nextHtml, "utf8");

console.log(`Extracted ${css.length} CSS characters to ${path.relative(root, cssPath)}.`);
console.log(`Extracted ${js.length} JS characters to ${path.relative(root, jsPath)}.`);
console.log(`Reduced index.html to ${nextHtml.length} characters.`);
