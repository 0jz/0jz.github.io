const list = await (await fetch('http://127.0.0.1:9227/json/list')).json();
const page = list.find(t => t.type === 'page' && String(t.url).startsWith('http')) || list.find(t => t.type === 'page');
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
await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result.value);
const sizes = async () => ev(`JSON.stringify([...document.querySelectorAll('.feat-pane')].map(p => {
  const d = p.querySelector('.demo');
  const r = d.getBoundingClientRect();
  return p.dataset.tone + (p.classList.contains('is-on') ? '*' : '') + ' demo ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' pane ' + Math.round(p.getBoundingClientRect().height);
}))`);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?feat2=' + Date.now() });
await new Promise(r => setTimeout(r, 10000));
console.log('desk arsenal', await sizes());
for (const i of [1, 2, 3]) {
  await send('Runtime.evaluate', { expression: `document.querySelectorAll('#feat-tabs .feat-tab')[${i}].click()` });
  await new Promise(r => setTimeout(r, 500));
  console.log('desk', i, await sizes());
}
const stamp = await ev(`(() => {
  const b = document.querySelector('#demo-passport .dm-stamps button');
  if (!b) return 'no button';
  b.click();
  return b.textContent + ' pressed ' + b.getAttribute('aria-pressed') + ' score ' + document.querySelector('#demo-passport .dm-big').textContent;
})()`);
console.log('stamp', stamp);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Runtime.evaluate', { expression: `document.querySelectorAll('#feat-tabs .feat-tab')[0].click()` });
await new Promise(r => setTimeout(r, 900));
console.log('mob arsenal', await sizes());
await send('Runtime.evaluate', { expression: `document.querySelectorAll('#feat-tabs .feat-tab')[1].click()` });
await new Promise(r => setTimeout(r, 500));
console.log('mob passport', await sizes());
ws.close();
