const list = await (await fetch('http://127.0.0.1:9227/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:8765'));
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
await send('Runtime.enable');
const ev = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true }).then(r => r.result.value);
await send('Runtime.evaluate', { expression: "document.querySelectorAll('#feat-tabs .feat-tab')[1].click()" });
await new Promise(r => setTimeout(r, 300));
await send('Runtime.evaluate', { expression: "document.querySelector('#demo-passport .dm-slot, #demo-passport button.dm-stamp, #demo-passport .dm-stamps button')?.click()" });
const pass = await ev(`document.querySelector('#demo-passport .dm-big')?.textContent + ' | ' + document.querySelector('#demo-passport .dm-status')?.textContent`);
console.log('passport', pass);
await send('Runtime.evaluate', { expression: "document.querySelectorAll('#feat-tabs .feat-tab')[3].click()" });
await new Promise(r => setTimeout(r, 300));
await send('Runtime.evaluate', { expression: "document.querySelector('#demo-ss3 .dm-roll').click()" });
await new Promise(r => setTimeout(r, 200));
const ss = await ev(`document.querySelector('#demo-ss3 .dm-count')?.textContent + ' | ' + document.querySelector('#demo-ss3 .dm-out')?.textContent`);
console.log('ss3', ss);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await new Promise(r => setTimeout(r, 500));
await send('Runtime.evaluate', { expression: "document.querySelectorAll('#feat-tabs .feat-tab')[0].click()" });
await new Promise(r => setTimeout(r, 800));
const sizes = await ev(`(() => {
  const on = document.querySelector('.feat-pane.is-on .demo').getBoundingClientRect();
  document.querySelectorAll('#feat-tabs .feat-tab')[1].click();
  return { arsenal: [Math.round(on.width), Math.round(on.height)] };
})()`);
await new Promise(r => setTimeout(r, 400));
const rest = await ev(`(() => [...document.querySelectorAll('.feat-pane .demo')].map(d => d.id + ' ' + Math.round(d.getBoundingClientRect().width) + 'x' + Math.round(d.getBoundingClientRect().height) + ' css ' + d.style.height))()`);
console.log('mobile visible was', JSON.stringify(sizes));
console.log('mobile all', rest);
ws.close();
