const list = await (await fetch('http://127.0.0.1:9224/json/list')).json();
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
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log('EXC', d.text, d.exception?.description || '');
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const args = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    if (m.params.type === 'error' || m.params.type === 'warning' || /arsenal|gun|TypeError/i.test(args)) {
      console.log('CON', m.params.type, args.slice(0, 800));
    }
  }
};
await new Promise(r => { ws.onopen = r; });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?nocache=' + Date.now() });
await new Promise(r => setTimeout(r, 14000));
const expr = `(() => {
  const root = document.querySelector('#demo-arsenal');
  const ark = root && root.querySelector('.dm-ark');
  return JSON.stringify({
    label: root && root.querySelector('.dm-label') && root.querySelector('.dm-label').textContent,
    hits: root && root.querySelector('.dm-hits') && root.querySelector('.dm-hits').textContent,
    real: ark && ark.className,
    slots: Array.from(root ? root.querySelectorAll('.dm-slot') : []).map(b => b.getAttribute('aria-label')),
    view: !!(root && root.querySelector('.dm-view')),
    btn: root && root.querySelector('.dm-range-btn') && root.querySelector('.dm-range-btn').textContent
  });
})()`;
const state = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log('STATE', state.result.value);
const box = await send('Runtime.evaluate', {
  expression: `(() => {
    const el = document.querySelector('#demo-arsenal .dm-stage');
    el.scrollIntoView({block:'center'});
    const r = el.getBoundingClientRect();
    return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});
  })()`,
  returnByValue: true
});
const r = JSON.parse(box.result.value);
console.log('BOX', box.result.value);
const fs = await import('fs');
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(new URL('./browser-range.png', import.meta.url), Buffer.from(shot.data, 'base64'));
const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
await new Promise(res => setTimeout(res, 400));
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(new URL('./browser-shot.png', import.meta.url), Buffer.from(shot2.data, 'base64'));
const hits = await send('Runtime.evaluate', {
  expression: `document.querySelector('#demo-arsenal .dm-hits').textContent + ' | ' + document.querySelector('#demo-arsenal .dm-label').textContent`,
  returnByValue: true
});
console.log('AFTER', hits.result.value);
ws.close();
