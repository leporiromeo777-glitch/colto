// Suoni generati dal browser (Web Audio): effetti sui tagli e una base ritmica diversa per ogni video.
// Gli effetti sono sintetizzati; la voce narrante, dove c'è, sono file in audio/<id>/.
// Tutto parte solo dopo un tocco, come vuole il browser.

const suono = {
  ctx: null,
  uscita: null,
  vuole: memoria.suono !== false,
  pronto: false,

  attivo() { return this.vuole && this.pronto && this.ctx?.state === 'running'; },

  // Da chiamare dentro un tocco o un clic.
  sblocca() {
    if (!this.vuole) return false;
    try {
      const Classe = window.AudioContext || window.webkitAudioContext;
      if (!Classe) return false;
      if (!this.ctx) {
        this.ctx = new Classe();
        const freno = this.ctx.createDynamicsCompressor();
        freno.threshold.value = -16; freno.knee.value = 18; freno.ratio.value = 5; freno.attack.value = 0.004; freno.release.value = 0.18;
        this.uscita = this.ctx.createGain();
        this.uscita.gain.value = 0.65;
        this.uscita.connect(freno).connect(this.ctx.destination);
        // la base ritmica passa da qui, così si abbassa mentre parla la voce
        this.musica = this.ctx.createGain();
        this.musica.connect(this.uscita);
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      this.pronto = true;
    } catch (e) { this.pronto = false; }
    return this.pronto;
  },

  _tono({ f = 440, a = 0, tipo = 'sine', dur = 0.12, vol = 0.2, tra = 0, attacco = 0.004, dove = null }) {
    if (!this.attivo()) return;
    const t = this.ctx.currentTime + tra;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f, t);
    if (a) o.frequency.exponentialRampToValueAtTime(a, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attacco);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dove || this.uscita);
    o.start(t);
    o.stop(t + dur + 0.03);
  },

  _rumore({ dur = 0.1, vol = 0.1, tipo = 'bandpass', f = 2000, a = 0, q = 1, tra = 0, dove = null }) {
    if (!this.attivo()) return;
    const t = this.ctx.currentTime + tra;
    if (!this._bianco) {
      const n = Math.floor(this.ctx.sampleRate * 0.6);
      this._bianco = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this._bianco.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = this.ctx.createBufferSource();
    s.buffer = this._bianco;
    const filtro = this.ctx.createBiquadFilter();
    filtro.type = tipo;
    filtro.Q.value = q;
    filtro.frequency.setValueAtTime(f, t);
    if (a) filtro.frequency.exponentialRampToValueAtTime(a, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(filtro).connect(g).connect(dove || this.uscita);
    s.start(t, Math.random() * 0.4);
    s.stop(t + dur + 0.03);
  },

  taglio() { this._rumore({ dur: 0.11, vol: 0.07, f: 700, a: 3600, q: 0.8 }); },
  colpo() {
    this._tono({ f: 150, a: 44, dur: 0.22, vol: 0.5 });
    this._rumore({ dur: 0.06, vol: 0.12, tipo: 'lowpass', f: 1800 });
  },
  pop() { this._tono({ f: 560, a: 900, dur: 0.07, vol: 0.12, tipo: 'triangle' }); },
  tocco() { this._tono({ f: 420, a: 520, dur: 0.05, vol: 0.1, tipo: 'triangle' }); },
  cuore() {
    this._tono({ f: 620, a: 930, dur: 0.1, vol: 0.14, tipo: 'triangle' });
    this._tono({ f: 930, a: 1240, dur: 0.12, vol: 0.1, tipo: 'triangle', tra: 0.08 });
  },
  giusto() {
    this._tono({ f: 784, dur: 0.12, vol: 0.2, tipo: 'triangle' });
    this._tono({ f: 1175, dur: 0.26, vol: 0.2, tipo: 'triangle', tra: 0.1 });
  },
  sbagliato() {
    this._tono({ f: 196, a: 150, dur: 0.24, vol: 0.14, tipo: 'triangle' });
    this._tono({ f: 185, a: 139, dur: 0.24, vol: 0.1, tipo: 'sine', tra: 0.02 });
  },
  timbro() {
    this._tono({ f: 110, a: 50, dur: 0.16, vol: 0.5 });
    this._rumore({ dur: 0.09, vol: 0.16, tipo: 'lowpass', f: 2400 });
  },
  fine() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tono({ f, dur: 0.2, vol: 0.16, tipo: 'triangle', tra: i * 0.075 })); },
  festa() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._tono({ f, dur: 0.26, vol: 0.16, tipo: 'triangle', tra: i * 0.085 }));
    [523.25, 783.99, 1046.5].forEach((f) => this._tono({ f, dur: 0.7, vol: 0.09, tipo: 'sine', tra: 0.46 }));
  },
};

// Base ritmica: cassa, rullante, charleston, basso e qualche nota, scelti a partire dal video.
const base = {
  timer: 0,
  id: null,
  parti(idVideo) {
    this.ferma();
    if (!suono.attivo()) return;
    const rnd = casuale(seme(idVideo + '/base'));
    const scegli = (lista) => lista[Math.floor(rnd() * lista.length)];
    const bpm = scegli([84, 88, 92, 96, 100]);
    this.passo = 60 / bpm / 4;
    this.radice = scegli([98, 110, 123.47, 130.81, 146.83]);
    this.cassa = scegli([[0, 8, 10], [0, 6, 8], [0, 3, 8, 11], [0, 7, 8, 14]]);
    this.bassi = scegli([[0, 0, 7, 5], [0, 3, 5, 3], [0, 5, 7, 5], [0, 0, 3, 5]]);
    const scala = [0, 3, 5, 7, 10, 12, 15];
    // melodia: 32 sedicesimi, poche note, sempre le stesse per questo video
    this.melodia = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 && rnd() < 0.3 ? scegli(scala) : null));
    this.n = 0;
    this.prossimo = suono.ctx.currentTime + 0.08;
    this.id = idVideo;
    this.timer = setInterval(() => this._programma(), 50);
    this._programma();
  },
  ferma() {
    clearInterval(this.timer);
    this.timer = 0;
    this.id = null;
  },
  _programma() {
    if (!suono.attivo()) return this.ferma();
    const ora = suono.ctx.currentTime;
    if (this.prossimo < ora - 0.3) this.prossimo = ora + 0.05; // scheda rimasta in pausa: riparti da qui
    while (this.prossimo < ora + 0.16) {
      this._suona(this.n % 32, this.prossimo - ora);
      this.prossimo += this.passo;
      this.n++;
    }
  },
  _suona(i, tra) {
    const s = i % 16;
    const semitoni = (n) => this.radice * Math.pow(2, n / 12);
    if (this.cassa.includes(s)) suono._tono({ f: 118, a: 42, dur: 0.2, vol: 0.34, tra, dove: suono.musica });
    if (s === 4 || s === 12) {
      suono._rumore({ dur: 0.11, vol: 0.085, f: 1700, q: 0.7, tra, dove: suono.musica });
      suono._tono({ f: 190, a: 120, dur: 0.08, vol: 0.06, tipo: 'triangle', tra, dove: suono.musica });
    }
    if (s % 2 === 0) suono._rumore({ dur: 0.035, vol: s % 4 === 2 ? 0.03 : 0.018, tipo: 'highpass', f: 7000, tra, dove: suono.musica });
    if (s === 0 || s === 8) {
      const nota = this.bassi[Math.floor(i / 8) % 4];
      suono._tono({ f: semitoni(nota), dur: this.passo * 6, vol: 0.17, tipo: 'triangle', attacco: 0.01, tra, dove: suono.musica });
    }
    const m = this.melodia[i];
    if (m !== null) suono._tono({ f: semitoni(m + 24), dur: 0.32, vol: 0.05, tipo: 'sine', attacco: 0.006, tra, dove: suono.musica });
  },
};

// Voce narrante registrata: una clip per scena (audio/<id>/<scena>.mp3; quiz e mito hanno anche «<scena>b»).
// Si scaricano in anticipo; si decodificano quando il suono è sbloccato.
const narratore = {
  cache: new Map(),
  sorgente: null,
  attuale: null,      // { url, buffer, inizio } della clip che sta suonando
  voluto: null,       // l'ultima clip chiesta, per non far partire clip arrivate in ritardo
  ferma0: 0,          // posizione (s) a cui era arrivata la clip messa in pausa

  url: (id, chiave) => `audio/${encodeURIComponent(id)}/${chiave}.mp3`,

  _voce(url) {
    let e = this.cache.get(url);
    if (!e) {
      // aprendo la pagina come file (doppio clic) il browser non scarica gli audio: il video resta senza voce
      const dati = /^https?:$/.test(location.protocol)
        ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        : Promise.reject(new Error('file'));
      e = { dati, buffer: null, decod: null };
      e.dati.catch(() => {});
      this.cache.set(url, e);
    }
    if (!e.buffer && !e.decod && suono.ctx) {
      e.decod = e.dati.then((b) => new Promise((ok, no) => suono.ctx.decodeAudioData(b.slice(0), ok, no)))
        .then((buf) => { e.buffer = buf; return buf; })
        .catch(() => null);
    }
    return e;
  },

  carica(video) {
    if (!video?.narrazione) return;
    for (const k of Object.keys(video.narrazione)) this._voce(this.url(video.id, k));
  },

  // da: millisecondi già trascorsi della clip (per riprendere a metà)
  suona(id, chiave, da = 0) {
    this.stop();
    if (!suono.attivo()) return;
    const url = this.url(id, chiave);
    const e = this._voce(url);
    const chiesta = { url, t0: suono.ctx.currentTime - da / 1000 };
    this.voluto = chiesta;
    const parti = (buf) => {
      if (!buf || this.voluto !== chiesta || !suono.attivo()) return;
      const offset = Math.max(0, suono.ctx.currentTime - chiesta.t0);
      if (offset > buf.duration - 0.25) return;
      this._avvia(url, buf, offset);
    };
    if (e.buffer) parti(e.buffer); else e.decod?.then(parti);
  },

  _avvia(url, buf, offset) {
    const ctx = suono.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(suono.uscita);
    src.onended = () => {
      if (this.sorgente !== src) return;
      this.sorgente = null;
      this.attuale = null;
      this._musica(1);
    };
    src.start(0, offset);
    this.sorgente = src;
    this.attuale = { url, buffer: buf, inizio: ctx.currentTime - offset };
    this._musica(0.3);
  },

  _musica(livello) {
    if (!suono.musica) return;
    const t = suono.ctx.currentTime;
    suono.musica.gain.cancelScheduledValues(t);
    suono.musica.gain.setTargetAtTime(livello, t, livello < 1 ? 0.06 : 0.35);
  },

  staParlando() { return !!this.sorgente; },

  pausa(si) {
    if (si) {
      if (!this.attuale) return;
      this.ferma0 = { url: this.attuale.url, buffer: this.attuale.buffer, pos: suono.ctx.currentTime - this.attuale.inizio };
      this.stop(true);
    } else if (this.ferma0 && suono.attivo()) {
      const { url, buffer, pos } = this.ferma0;
      this.ferma0 = null;
      this.voluto = { url };
      this._avvia(url, buffer, pos);
    }
  },

  stop(tieniPausa) {
    this.voluto = null;
    if (!tieniPausa) this.ferma0 = null;
    const src = this.sorgente;
    this.sorgente = null;
    this.attuale = null;
    if (src) { try { src.onended = null; src.stop(); } catch (e) { /* già finita */ } }
    if (suono.ctx) this._musica(1);
  },
};
