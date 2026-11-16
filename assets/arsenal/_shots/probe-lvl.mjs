const list = await (await fetch('http://127.0.0.1:9226/json/list')).json();
const page = list.find(t => t.type === 'page');
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?lvl=' + Date.now() });
await new Promise(r => setTimeout(r, 11000));
await send('Runtime.evaluate', { expression: "document.querySelector('#demo-arsenal .dm-stage').scrollIntoView({block:'center'})" });
const fs = await import('fs');
const dir = 'C:/Users/nikol/orca/workspaces/CV sajt/frigatebird/assets/arsenal/_shots/';
const a = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(dir + 'lvl-range.png', Buffer.from(a.data, 'base64'));
const sig = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true });
const s1 = await sig("document.querySelector('#demo-arsenal .dm-slot canvas').toDataURL().slice(100,160)");
await new Promise(r => setTimeout(r, 800));
const s2 = await sig("document.querySelector('#demo-arsenal .dm-slot canvas').toDataURL().slice(100,160)");
console.log('thumb moved', s1.result.value !== s2.result.value);
await send('Runtime.evaluate', { expression: "document.querySelector('#demo-arsenal .dm-range-btn').click()" });
await new Promise(r => setTimeout(r, 500));
const b = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(dir + 'lvl-armory.png', Buffer.from(b.data, 'base64'));
console.log('saved');
ws.close();
