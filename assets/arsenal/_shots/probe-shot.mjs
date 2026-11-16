const list = await (await fetch('http://127.0.0.1:9225/json/list')).json();
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
  } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    const args = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    console.log('CON', args.slice(0, 400));
  }
};
await new Promise(r => { ws.onopen = r; });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?shot=' + Date.now() });
await new Promise(r => setTimeout(r, 12000));
const expr = `(() => {
  const el = document.querySelector('#demo-arsenal .dm-view');
  el.scrollIntoView({block:'center'});
  const r = el.getBoundingClientRect();
  return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,hits:document.querySelector('#demo-arsenal .dm-hits').textContent});
})()`;
const box = JSON.parse((await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value);
const fs = await import('fs');
const click = async (nx, ny) => {
  const x = box.x + box.w * nx, y = box.y + box.h * ny;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 250));
  const hits = await send('Runtime.evaluate', {
    expression: `document.querySelector('#demo-arsenal .dm-hits').textContent`,
    returnByValue: true
  });
  console.log('click', nx.toFixed(2), ny.toFixed(2), hits.result.value);
};
await click(0.78, 0.58);
await click(0.84, 0.62);
await click(0.72, 0.52);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(new URL('./browser-right.png', import.meta.url), Buffer.from(shot.data, 'base64'));
await send('Runtime.evaluate', {
  expression: `document.querySelector('#demo-arsenal .dm-range-btn').click()`,
  returnByValue: true
});
await new Promise(r => setTimeout(r, 600));
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(new URL('./browser-armory.png', import.meta.url), Buffer.from(shot2.data, 'base64'));
console.log('saved');
ws.close();
