const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const CDP = require('chrome-remote-interface');

const PORT = Number(process.env.REMOTE_BROWSER_PORT || 5051);
const TOKEN = process.env.REMOTE_BROWSER_TOKEN || '';
const CDP_PORT = Number(process.env.CHROME_CDP_PORT || 9222);
const ROOT = __dirname;

function authorized(req) {
  if (!TOKEN) return true;
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get('token') === TOKEN;
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function tabs() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json/list`, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => {
        try { resolve(JSON.parse(body).filter(t => t.type === 'page')); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function newTab(url = 'about:blank') {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') return json(res, 200, { status: 'online', service: 'remote-browser' });
  if (url.pathname === '/api/tabs') {
    try { return json(res, 200, await tabs()); }
    catch (e) { return json(res, 502, { error: e.message }); }
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
  }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!authorized(req) || !req.url.startsWith('/ws')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

async function attachTarget(targetId) {
  return CDP({ host: '127.0.0.1', port: CDP_PORT, target: targetId });
}

wss.on('connection', async ws => {
  let client;
  let targetId;
  let timer;
  const send = value => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(value)); };
  const closeClient = async () => {
    if (timer) clearInterval(timer);
    if (client) { try { await client.Page.stopScreencast(); } catch (_) {} try { await client.close(); } catch (_) {} client = null; }
  };
  const snapshot = async () => {
    if (!client) return;
    try {
      const title = await client.Runtime.evaluate({ expression: 'document.title' });
      const location = await client.Runtime.evaluate({ expression: 'location.href' });
      send({ type: 'meta', title: title.result?.value || '', url: location.result?.value || '' });
    } catch (_) {}
  };
  const connect = async id => {
    await closeClient();
    targetId = id;
    client = await attachTarget(id);
    await client.Page.enable();
    await client.Runtime.enable();
    await client.Emulation.setDeviceMetricsOverride({ width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    client.Page.screencastFrame(async event => {
      send({ type: 'frame', image: event.data });
      try { await client.Page.screencastFrameAck({ sessionId: event.sessionId }); } catch (_) {}
    });
    await client.Page.startScreencast({ format: 'jpeg', quality: 65, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
    client.Page.loadEventFired(() => snapshot());
    timer = setInterval(snapshot, 2500);
    await snapshot();
  };

  try {
    const list = await tabs();
    const selected = list[0];
    if (!selected) throw new Error('Chrome tab bulunamadı');
    await connect(selected.id);
    send({ type: 'ready', tabs: list, targetId });
  } catch (e) { send({ type: 'error', error: e.message }); }

  ws.on('message', async raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'refreshTabs') return send({ type: 'tabs', tabs: await tabs(), targetId });
      if (msg.type === 'newTab') {
        const t = await newTab(msg.url || 'about:blank');
        await connect(t.id);
        return send({ type: 'tabs', tabs: await tabs(), targetId });
      }
      if (msg.type === 'switchTab') {
        await connect(msg.id);
        return send({ type: 'tabs', tabs: await tabs(), targetId });
      }
      if (!client) return;
      if (msg.type === 'navigate') {
        let value = String(msg.url || '').trim();
        if (!/^https?:\/\//i.test(value)) value = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
        await client.Page.navigate({ url: value });
      } else if (msg.type === 'back') await client.Page.goBack();
      else if (msg.type === 'forward') await client.Page.goForward();
      else if (msg.type === 'reload') await client.Page.reload({ ignoreCache: false });
      else if (msg.type === 'click') await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: msg.x, y: msg.y, button: 'left', clickCount: 1 });
      else if (msg.type === 'release') await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: msg.x, y: msg.y, button: 'left', clickCount: 1 });
      else if (msg.type === 'move') await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: msg.x, y: msg.y });
      else if (msg.type === 'scroll') await client.Input.dispatchMouseEvent({ type: 'mouseWheel', x: msg.x || 640, y: msg.y || 360, deltaY: msg.deltaY, deltaX: 0 });
      else if (msg.type === 'text') await client.Input.insertText({ text: String(msg.text || '') });
      else if (msg.type === 'key') await client.Input.dispatchKeyEvent({ type: msg.down === false ? 'keyUp' : 'keyDown', key: msg.key, code: msg.code || msg.key, text: msg.text || undefined, unmodifiedText: msg.text || undefined });
      setTimeout(snapshot, 150);
    } catch (e) { send({ type: 'error', error: e.message }); }
  });
  ws.on('close', closeClient);
});

server.listen(PORT, '0.0.0.0', () => console.log(`Remote browser listening on ${PORT}`));
