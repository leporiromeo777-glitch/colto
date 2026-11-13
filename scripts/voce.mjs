#!/usr/bin/env node
// Voce narrante registrata (per esempio con ElevenLabs su Higgsfield), una clip per scena.
//
//   node scripts/voce.mjs testi <id-video> [...]      → stampa in JSON le frasi da far leggere
//   node scripts/voce.mjs registra <file.json>        → scarica le clip, le misura e aggiorna audio/indice.json
//
// <file.json> è una lista [{ "id": "<id-video>", "chiave": "3", "url": "https://…mp3" }, …].
// La chiave è il numero della scena (da 0); quiz e mito hanno due clip: «3» (domanda o mito) e «3b»
// (risposta o versione del libro). Le clip finiscono in audio/<id-video>/<chiave>.mp3.
// L'indice ricorda il testo letto: se poi cambia il testo di una scena, «testi» lo segnala come da rifare.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = join(RADICE, 'audio');
const INDICE = join(AUDIO, 'indice.json');

const pulito = (s) => String(s ?? '').replace(/==/g, '');

// Rende un testo scritto per lo schermo più facile da leggere ad alta voce.
export function parlato(s) {
  return pulito(s)
    .replace(/[«»"“”]/g, '')
    .replace(/(\d)[   ](?=\d{3}\b)/g, '$1')              // 10 000 → 10000
    .replace(/(\d+),(\d{2}) (euro|dollari)/g, '$1 $3 e $2')         // 1,10 euro → 1 euro e 10
    .replace(/(\d)\s*×\s*(\d)/g, '$1 per $2')
    .replace(/(\d)\s*×/g, '$1 volte')
    .replace(/−(?=\d)/g, 'meno ')
    .replace(/\+(?=\d)/g, 'più ')
    .replace(/(\d)\s*%/g, '$1 per cento')
    .replace(/€\s*(\d[\d.,]*)/g, '$1 euro').replace(/(\d)\s*€/g, '$1 euro')
    .replace(/\$\s*(\d[\d.,]*)/g, '$1 dollari').replace(/(\d)\s*\$/g, '$1 dollari')
    .replace(/\bmln\b/g, 'milioni').replace(/\bmld\b/g, 'miliardi')
    .replace(/km²/g, 'chilometri quadrati')
    .replace(/\ba\.C\./g, 'avanti Cristo').replace(/\bd\.C\./g, 'dopo Cristo')
    .replace(/\s*→\s*/g, ', poi ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\.\.\./g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

const frase = (s) => {
  const t = parlato(s);
  return !t ? '' : /[.!?…:]$/.test(t) ? t : t + '.';
};
const unisci = (...parti) => parti.map(frase).filter(Boolean).join(' ');
const formatta = (v, dec = 0) => Number(v).toFixed(dec).replace('.', ',');

// Le frasi di un video, nell'ordine delle scene.
export function clipDelVideo(v) {
  const clip = [];
  v.scene.forEach((sc, i) => {
    const k = String(i);
    switch (sc.tipo) {
      case 'apertura': case 'colpo': case 'principio': case 'esempio':
        clip.push({ chiave: k, testo: unisci(sc.testo) }); break;
      case 'testo':
        clip.push({ chiave: k, testo: unisci(sc.titolo, sc.testo) }); break;
      case 'elenco':
        clip.push({ chiave: k, testo: unisci(sc.titolo, ...sc.voci) }); break;
      case 'numero':
        clip.push({ chiave: k, testo: unisci(`${sc.prefisso || ''}${formatta(sc.valore, sc.decimali || 0)}${sc.suffisso || ''}`, sc.didascalia) }); break;
      case 'confronto':
        clip.push({ chiave: k, testo: unisci(sc.titolo, `${sc.a.etichetta}: ${sc.a.voci.join(', ')}`, `${sc.b.etichetta}: ${sc.b.voci.join(', ')}`) }); break;
      case 'grafico':
        clip.push({ chiave: k, testo: unisci(sc.titolo, sc.nota) }); break;
      case 'quiz':
        clip.push({ chiave: k, testo: `${frase(sc.domanda)} ${sc.opzioni.map(parlato).join(', oppure ')}?` });
        clip.push({ chiave: k + 'b', testo: unisci(`Risposta: ${sc.opzioni[sc.corretta]}`, sc.spiegazione) }); break;
      case 'mito':
        clip.push({ chiave: k, testo: unisci(`Si dice: ${sc.mito}`) });
        clip.push({ chiave: k + 'b', testo: unisci('Falso', sc.realta) }); break;
      case 'chiusura':
        clip.push({ chiave: k, testo: unisci('Da provare oggi', sc.azione) }); break;
    }
  });
  return clip;
}

const impronta = (t) => createHash('sha1').update(t).digest('hex').slice(0, 10);

export function leggiIndice() {
  try { return JSON.parse(readFileSync(INDICE, 'utf8')); } catch { return {}; }
}

function tuttiIVideo() {
  const cartella = join(RADICE, 'contenuti');
  return readdirSync(cartella).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => JSON.parse(readFileSync(join(cartella, f), 'utf8')));
}

// Per l'app: le durate (ms) delle clip ancora valide, cioè registrate sul testo attuale.
export function narrazioni(video) {
  const indice = leggiIndice();
  const uscita = {};
  for (const v of video) {
    const reg = indice[v.id];
    if (!reg) continue;
    const clip = clipDelVideo(v);
    if (!clip.every((c) => reg[c.chiave] && reg[c.chiave].impronta === impronta(c.testo))) continue;
    uscita[v.id] = Object.fromEntries(clip.map((c) => [c.chiave, reg[c.chiave].ms]));
  }
  return uscita;
}

function durataMs(file) {
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Math.round(parseFloat(s) * 1000);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [comando, ...resto] = process.argv.slice(2);
  const video = tuttiIVideo();
  const perId = new Map(video.map((v) => [v.id, v]));

  if (comando === 'testi') {
    const indice = leggiIndice();
    const elenco = (resto.length ? resto : video.map((v) => v.id)).map((id) => {
      const v = perId.get(id);
      if (!v) throw new Error(`Video sconosciuto: ${id}`);
      return clipDelVideo(v).map((c) => ({ id, ...c, fatta: indice[id]?.[c.chiave]?.impronta === impronta(c.testo) }));
    }).flat();
    console.log(JSON.stringify(elenco, null, 1));
  } else if (comando === 'registra') {
    const voci = JSON.parse(readFileSync(resto[0], 'utf8'));
    const indice = leggiIndice();
    for (const { id, chiave, url } of voci) {
      const v = perId.get(id);
      const c = v && clipDelVideo(v).find((x) => x.chiave === chiave);
      if (!c) throw new Error(`Clip sconosciuta: ${id} ${chiave}`);
      const cartella = join(AUDIO, id);
      mkdirSync(cartella, { recursive: true });
      const grezzo = join(cartella, `${chiave}.grezzo`);
      const finale = join(cartella, `${chiave}.mp3`);
      execFileSync('curl', ['-sSfL', '--retry', '3', '-o', grezzo, url]);
      // silenzio iniziale e finale tolto, voce più svelta del 10% (stesso tono), volume uniforme,
      // mono a 48 kbit/s: file leggeri e tempi precisi
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', grezzo,
        '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,atempo=1.1,loudnorm=I=-17:TP=-1.5:LRA=11',
        '-ac', '1', '-ar', '44100', '-b:a', '48k', `${finale}.tmp.mp3`]);
      renameSync(`${finale}.tmp.mp3`, finale);
      rmSync(grezzo, { force: true });
      indice[id] = { ...(indice[id] || {}), [chiave]: { ms: durataMs(finale), impronta: impronta(c.testo) } };
      console.log(`✓ ${id} ${chiave}: ${indice[id][chiave].ms} ms`);
    }
    mkdirSync(AUDIO, { recursive: true });
    writeFileSync(INDICE, JSON.stringify(indice, null, 1) + '\n');
    const complete = Object.keys(narrazioni(video)).length;
    console.log(`Video con narrazione completa: ${complete}`);
  } else {
    console.error('Uso: node scripts/voce.mjs testi <id…> | registra <file.json>');
    process.exit(1);
  }
}

