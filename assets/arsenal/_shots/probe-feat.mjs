const list = await (await fetch('http://127.0.0.1:9227/json/list')).json();
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
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?feat=' + Date.now() });
await new Promise(r => setTimeout(r, 10000));
const fs = await import('fs');
const dir = 'C:/Users/nikol/orca/workspaces/CV sajt/frigatebird/assets/arsenal/_shots/';
const evalj = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true });
const measure = async (name) => {
  await send('Runtime.evaluate', { expression: "document.querySelector('#featured').scrollIntoView({block:'center'})" });
  await new Promise(r => setTimeout(r, 400));
  const info = await evalj(`(() => {
    const panes = [...document.querySelectorAll('.feat-pane')];
    return panes.map(p => {
      const d = p.querySelector('.demo');
      const r = d.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      return { tone: p.dataset.tone, on: p.classList.contains('is-on'), hidden: p.hidden, demo: [Math.round(r.width), Math.round(r.height)], paneH: Math.round(pr.height), styleH: d.style.height, minH: p.style.minHeight };
    });
  })()`);
  console.log(name, JSON.stringify(info.result.value));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(dir + 'feat-' + name + '.png', Buffer.from(shot.data, 'base64'));
};
await measure('arsenal');
for (const [i, name] of [['1','icy'],['2','monad'],['3','tgs']]) {
  await send('Runtime.evaluate', { expression: `document.querySelectorAll('#feat-tabs .feat-tab')[${i}].click()` });
  await new Promise(r => setTimeout(r, 700));
  await measure(name);
}
ws.close();
