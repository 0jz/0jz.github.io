const list = await (await fetch('http://127.0.0.1:9226/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url === 'about:blank') || list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = ++id;
  pending.set(msgId, { resolve, reject });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(JSON.stringify(m.error)));
    else p.resolve(m.result);
  }
};
await new Promise(r => { ws.onopen = r; });
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?focus=' + Date.now() });
await new Promise(r => setTimeout(r, 11000));
const sig = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true });
const info = await sig(`(() => {
  const top = document.querySelector('#demo-arsenal .dm-top');
  const view = document.querySelector('#demo-arsenal .dm-view');
  const gun = document.querySelector('#demo-arsenal .dm-inspect');
  const ark = document.querySelector('#demo-arsenal .dm-ark');
  const cs = view ? getComputedStyle(view) : null;
  const ts = top ? getComputedStyle(top) : null;
  const gs = gun ? getComputedStyle(gun) : null;
  return {
    ranging: ark?.classList.contains('ranging-on') || false,
    topDisplay: ts?.display || null,
    topText: top?.innerText || null,
    viewFilter: cs?.filter || null,
    gunDisplay: gs?.display || null,
    gunVis: gs?.visibility || null,
    canvases: [...document.querySelectorAll('#demo-arsenal canvas')].map(c => c.className + ' ' + c.width + 'x' + c.height),
    label: document.querySelector('#demo-arsenal .dm-label')?.textContent || null
  };
})()`);
console.log('range', JSON.stringify(info.result.value, null, 2));
await send('Runtime.evaluate', { expression: "document.querySelector('#demo-arsenal .dm-stage').scrollIntoView({block:'center'})" });
const fs = await import('fs');
const dir = 'C:/Users/nikol/orca/workspaces/CV sajt/frigatebird/assets/arsenal/_shots/';
const a = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(dir + 'focus-range.png', Buffer.from(a.data, 'base64'));
await send('Runtime.evaluate', { expression: "document.querySelector('#demo-arsenal .dm-range-btn').click()" });
await new Promise(r => setTimeout(r, 700));
const info2 = await sig(`(() => {
  const view = document.querySelector('#demo-arsenal .dm-view');
  const gun = document.querySelector('#demo-arsenal .dm-inspect');
  const ark = document.querySelector('#demo-arsenal .dm-ark');
  const top = document.querySelector('#demo-arsenal .dm-top');
  return {
    ranging: ark?.classList.contains('ranging-on') || false,
    topDisplay: top ? getComputedStyle(top).display : null,
    viewFilter: view ? getComputedStyle(view).filter : null,
    gunVis: gun ? getComputedStyle(gun).visibility : null,
    gunW: gun?.width, gunH: gun?.height
  };
})()`);
console.log('armory', JSON.stringify(info2.result.value, null, 2));
const b = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(dir + 'focus-armory.png', Buffer.from(b.data, 'base64'));
console.log('saved');
ws.close();
