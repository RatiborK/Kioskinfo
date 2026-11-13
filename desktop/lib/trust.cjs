// desktop/lib/trust.cjs — IPC sender validation for Electron main frame.
// Electron may return distinct WebFrameMain wrappers for the same frame.
// Compare stable frameTreeNodeId, not JavaScript object identity alone.
'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');

function sameMainFrame(frame, main) {
  if (!frame || !main || frame.parent !== null) return false;
  if (frame === main) return true;
  if (Number.isSafeInteger(frame.frameTreeNodeId) &&
      Number.isSafeInteger(main.frameTreeNodeId) &&
      frame.frameTreeNodeId === main.frameTreeNodeId) return true;
  return Number.isSafeInteger(frame.processId) &&
    Number.isSafeInteger(frame.routingId) &&
    frame.processId === main.processId && frame.routingId === main.routingId;
}
function sameFile(url, expectedPath, platform = process.platform) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) return false;
    const actual = path.normalize(fileURLToPath(parsed));
    const expected = path.normalize(path.resolve(expectedPath));
    return platform === 'win32'
      ? actual.toLocaleLowerCase('en-US') === expected.toLocaleLowerCase('en-US')
      : actual === expected;
  } catch { return false; }
}
function sameLocalPage(url, localOrigin) {
  try {
    const parsed = new URL(url);
    const site = new URL(localOrigin);
    return site.protocol === 'http:' &&
      site.hostname === '127.0.0.1' &&
      parsed.origin === site.origin &&
      !parsed.username && !parsed.password &&
      (parsed.pathname === '/screen' || parsed.pathname === '/editor');
  } catch { return false; }
}
function trustedFrame(event, win, {setupPath, origin, setup = false}) {
  if (!win || win.isDestroyed() || !event ||
      event.sender !== win.webContents ||
      !sameMainFrame(event.senderFrame, win.webContents.mainFrame)) return false;
  const frameUrl = event.senderFrame.url;
  const windowUrl = win.webContents.getURL();
  return setup
    ? sameFile(frameUrl,setupPath) && sameFile(windowUrl,setupPath)
    : sameLocalPage(frameUrl,origin) && sameLocalPage(windowUrl,origin);
}
module.exports = {sameMainFrame,sameFile,sameLocalPage,trustedFrame};
