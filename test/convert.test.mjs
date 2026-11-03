import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  compactChat,
  compactEvent,
  compactMessage,
  firstName,
  messageText,
  preview,
  quickReplies,
  serverURL,
  sortChats,
  timeLabel,
  upsertChat,
} from '../shared/convert.js'

const at = (y, mo, d, h = 12, mi = 0) => Math.floor(new Date(y, mo - 1, d, h, mi).getTime() / 1000)
const now = new Date(2026, 10, 3, 15, 0) // Tuesday 3 November 2026

test('messageText labels media and kinds', () => {
  assert.equal(messageText({ kind: 'text', text: 'hai' }), 'hai')
  assert.equal(messageText({ kind: 'media', media: 'image', text: '' }), 'Foto')
  assert.equal(messageText({ kind: 'media', media: 'image', text: 'pantai' }), '[Foto] pantai')
  assert.equal(messageText({ kind: 'media', media: 'voice', duration: 72 }), 'Pesan suara 1:12')
  assert.equal(messageText({ kind: 'media', media: 'document', text: 'cv.pdf' }), '[Dokumen] cv.pdf')
  assert.equal(messageText({ kind: 'deleted', text: 'x' }), 'Pesan ini dihapus')
  assert.equal(messageText({ kind: 'viewonce' }), 'Sekali lihat')
})

test('firstName', () => {
  assert.equal(firstName('Zaki Fauzan Azhima'), 'Zaki')
  assert.equal(firstName('~ Budi Santoso'), '~ Budi Santoso')
  assert.equal(firstName('+62 812-7146-6413'), '+62 812-7146-6413')
  assert.equal(firstName(''), '')
})

test('timeLabel', () => {
  assert.equal(timeLabel(at(2026, 11, 3, 9, 5), now), '09:05')
  assert.equal(timeLabel(at(2026, 11, 2, 23, 59), now), 'Kemarin')
  assert.equal(timeLabel(at(2026, 10, 30), now), 'Jum')
  assert.equal(timeLabel(at(2026, 10, 20), now), '20/10/26')
})

test('preview names who sent the last message', () => {
  const last = { kind: 'text', text: 'biar bisa\nmegang obor', sender: 'Satria Wibowo' }
  assert.equal(preview({ group: true, last }), 'Satria: biar bisa megang obor')
  assert.equal(preview({ group: false, last }), 'biar bisa megang obor')
  assert.equal(preview({ last: { kind: 'text', text: 'ok', mine: true } }), 'Kamu: ok')
  assert.equal(preview({ group: true, last: { kind: 'system', text: 'Ani joined' } }), 'Ani joined')
  assert.equal(preview({}), '')
  assert.ok(preview({ last: { kind: 'text', text: 'a'.repeat(200) } }).endsWith('…'))
})

test('compactChat and compactMessage keep only what the watch shows', () => {
  // The server's answer from a real run (GET /v1/chats).
  const c = {
    id: '120363413354008995@g.us', name: 'Niche (K + R)', group: true, muted: true, unread: 53,
    time: at(2026, 11, 3, 13, 7),
    last: { id: 'AC76', sender: 'Zaki Fauzan Azhima', kind: 'viewonce', time: at(2026, 11, 3, 13, 7) },
  }
  assert.deepEqual(compactChat(c, now), {
    i: c.id, n: 'Niche (K + R)', v: 'Zaki: Sekali lihat', t: '13:07', s: c.time, g: 1, m: 1, u: 53,
  })
  const m = compactMessage({
    id: 'X', mine: true, kind: 'text', text: 'ini lo', time: at(2026, 11, 3, 10, 1), status: 'read', edited: true,
    quote: { id: 'Q', sender: 'Satria', text: 'cariin yg bisa\nmake item' },
  })
  assert.deepEqual(m, { i: 'X', x: 'ini lo', t: '10:01', o: 1, k: 'r', e: 1, q: 'Satria: cariin yg bisa make item' })
  assert.equal(compactMessage({ id: 'Y', kind: 'text', text: 'hi', time: 0, quote: { sender: 'You', text: 'yo' } }).q, 'Kamu: yo')
  assert.equal(compactMessage({ id: 'Z', kind: 'text', text: 'long…', truncated: true, time: 0 }).c, 1)
})

test('compactEvent', () => {
  assert.deepEqual(compactEvent({ type: 'receipt', chat: 'c', ids: ['a'], status: 'delivered' }), { t: 'r', c: 'c', i: ['a'], k: 'd' })
  assert.deepEqual(compactEvent({ type: 'reset' }), { t: 'x' })
  assert.deepEqual(compactEvent({ type: 'conn', state: 'online' }), { t: 's', s: 'online' })
  assert.equal(compactEvent({ type: 'typing' }), null)
  const e = compactEvent({ type: 'message', chat: 'c', new: true, message: { id: 'm', kind: 'text', text: 'hi', time: 0 } })
  assert.equal(e.t, 'm')
  assert.equal(e.n, 1)
  assert.equal(e.m.x, 'hi')
})

test('upsertChat keeps the list in order', () => {
  const list = sortChats([
    { i: 'p1', f: 1, s: 5 },
    { i: 'a', s: 30 },
    { i: 'b', s: 20 },
    { i: 'p2', f: 1, s: 1 },
  ])
  assert.deepEqual(list.map((c) => c.i), ['p1', 'p2', 'a', 'b'])
  // A message in b moves it up, under the pinned ones.
  assert.deepEqual(upsertChat(list, { i: 'b', s: 40 }).map((c) => c.i), ['p1', 'p2', 'b', 'a'])
  // A pinned chat stays where it is.
  assert.deepEqual(upsertChat(list, { i: 'p2', f: 1, s: 50 }).map((c) => c.i), ['p1', 'p2', 'a', 'b'])
  // A new chat comes in; an archived one leaves.
  assert.deepEqual(upsertChat(list, { i: 'n', s: 25 }).map((c) => c.i), ['p1', 'p2', 'a', 'n', 'b'])
  assert.deepEqual(upsertChat(list, { i: 'a', s: 30, a: 1 }).map((c) => c.i), ['p1', 'p2', 'b'])
})

test('settings helpers', () => {
  assert.deepEqual(quickReplies(' Oke \n\n Nanti ya '), ['Oke', 'Nanti ya'])
  assert.equal(quickReplies('').length, 4)
  assert.equal(serverURL(' 100.64.0.1:8642/ '), 'http://100.64.0.1:8642')
  assert.equal(serverURL('https://legion.ts.net'), 'https://legion.ts.net')
  assert.equal(serverURL(''), '')
})
