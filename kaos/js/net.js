// PeerJS (WebRTC) ile eşler arası bağlantı. Odayı kuran kişi "ev sahibi" olur,
// dünyayı o yönetir; diğerleri oda koduyla doğrudan ona bağlanır. Sunucu gerekmez.

const PREFIX = 'kaos-adasi-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function peerOpts() {
  const q = new URLSearchParams(location.search);
  const o = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    },
  };
  // test için kendi PeerJS sunucusu: ?ps=localhost:9000
  const ps = q.get('ps');
  if (ps) { const [host, port] = ps.split(':'); o.host = host; o.port = +port || 9000; o.path = '/'; o.secure = false; }
  return o;
}

export class Net {
  constructor() {
    this.isHost = false;
    this.peer = null;
    this.conns = new Map();
    this.hostConn = null;
    this.hostQ = [];
    this.clientQ = [];
    this.code = null;
    this.myId = null;
    this.lastHostMsg = 0;
    this.onPeerLeave = null;
  }

  startHost(onReady, onFail) {
    this.isHost = true;
    this.myId = 'h';
    if (typeof Peer === 'undefined') { onFail({ type: 'nolib' }); return; }
    const tryOpen = (attempt) => {
      const code = makeCode();
      let peer;
      try { peer = new Peer(PREFIX + code, peerOpts()); } catch (e) { onFail(e); return; }
      let opened = false;
      peer.on('open', () => { opened = true; this.peer = peer; this.code = code; onReady(code); });
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('error', (err) => {
        if (!opened && err.type === 'unavailable-id' && attempt < 5) { try { peer.destroy(); } catch (e) { /* yok */ } tryOpen(attempt + 1); return; }
        if (!opened) onFail(err);
      });
      peer.on('disconnected', () => { setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* yok */ } }, 2000); });
    };
    tryOpen(0);
  }

  accept(conn) {
    conn.on('open', () => { this.conns.set(conn.peer, conn); });
    conn.on('data', (d) => { this.hostQ.push([conn.peer, d]); });
    const close = () => {
      if (this.conns.get(conn.peer) === conn) {
        this.conns.delete(conn.peer);
        if (this.onPeerLeave) this.onPeerLeave(conn.peer);
      }
    };
    conn.on('close', close);
    conn.on('error', close);
  }

  kick(pid) {
    const c = this.conns.get(pid);
    if (c) { this.conns.delete(pid); try { c.close(); } catch (e) { /* yok */ } }
  }

  join(code, onOpen, onFail, onClose) {
    if (typeof Peer === 'undefined') { onFail('Bağlantı kütüphanesi yüklenemedi. İnternetini kontrol et.'); return; }
    const peer = new Peer(peerOpts());
    this.peer = peer;
    let done = false, closed = false;
    const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); onFail(msg); try { peer.destroy(); } catch (e) { /* yok */ } };
    const lost = () => { if (closed) return; closed = true; if (onClose) onClose(); };
    const timer = setTimeout(() => fail('Bağlantı zaman aşımına uğradı. Kod doğru mu? Ev sahibi oyunda mı?'), 20000);
    peer.on('open', (id) => {
      this.myId = id;
      const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
      this.hostConn = conn;
      conn.on('open', () => { if (done) return; done = true; clearTimeout(timer); this.lastHostMsg = performance.now(); onOpen(id); });
      conn.on('data', (d) => { this.lastHostMsg = performance.now(); this.clientQ.push(d); });
      conn.on('close', lost);
      conn.on('error', lost);
    });
    peer.on('error', (err) => {
      if (!done) fail(err.type === 'peer-unavailable' ? 'Böyle bir oda bulunamadı. Kodu kontrol et.' : 'Bağlantı hatası: ' + err.type);
      else if (err.type === 'peer-unavailable') lost();
    });
  }

  // istemci -> ev sahibi
  toHost(msg) {
    if (this.isHost) this.hostQ.push(['h', msg]);
    else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send(msg); } catch (e) { /* yok */ } }
  }

  // ev sahibi -> istemci
  sendTo(pid, msg) {
    if (pid === 'h') { this.clientQ.push(msg); return; }
    const c = this.conns.get(pid);
    if (c && c.open) { try { c.send(msg); } catch (e) { /* yok */ } }
  }

  broadcast(msg, except) {
    if (except !== 'h' && this.isHost) this.clientQ.push(msg);
    for (const [pid, c] of this.conns) {
      if (pid !== except && c.open) { try { c.send(msg); } catch (e) { /* yok */ } }
    }
  }

  get peerCount() { return this.conns.size; }
}
