// A conversation: its newest 15 messages, older ones on request (at most
// MAX in memory), and a Balas (reply) button after the newest. Opening it
// marks the chat read; it follows new messages and receipts while open.

import { BasePage } from '@zeppos/zml/base-page'
import { scrollTo } from '@zos/page'
import { push } from '@zos/router'
import { align } from '@zos/ui'
import { px } from '@zos/utils'
import { poll } from '../../utils/poll'
import { C, Canvas, H, L, W, avatarColor, errorView, measure, textWidth } from '../../utils/ui'

// MAX is how many messages the page keeps; older ones can't be loaded past it.
const MAX = 45

const TICKS = { '!': '!', p: '•', s: '✓', d: '✓✓', r: '✓✓' }
const RANK = { '!': 0, p: 1, s: 2, d: 3, r: 4 }

Page(
  BasePage({
    onInit(params) {
      let p = {}
      try {
        p = JSON.parse(params || '{}')
      } catch (e) {}
      this.p = p
      this.cv = new Canvas()
      this.msgs = []
      this.more = false
      this.loading = true
      this.err = null
      this.stop = null
    },

    build() {
      this.render(false)
      // Follow changes from now on, then load: nothing falls in between.
      this.stop = poll(this, '', (evs) => this.apply(evs), () => this.load())
      this.load()
      this.markRead()
    },

    onDestroy() {
      if (this.stop) this.stop()
    },

    markRead() {
      this.request({ method: 'read', params: { chat: this.p.i } }).catch(() => {})
    },

    load() {
      this.request({ method: 'msgs', params: { chat: this.p.i } })
        .then((d) => {
          this.loading = false
          if (d.err) {
            this.err = { code: d.err, msg: d.msg }
          } else {
            this.err = null
            this.msgs = d.m
            this.more = !!d.more
          }
          this.render(true)
        })
        .catch(() => {
          this.loading = false
          this.err = { code: 'phone' }
          this.render(true)
        })
    },

    older() {
      const first = this.msgs[0]
      if (!first) return
      this.request({ method: 'msgs', params: { chat: this.p.i, before: first.i } })
        .then((d) => {
          if (d.err) return
          this.msgs = d.m.concat(this.msgs)
          this.more = !!d.more
          this.render(false)
          scrollTo({ y: 0 })
        })
        .catch(() => {})
    },

    // whole loads all of a message whose text was cut.
    whole(m) {
      this.request({ method: 'msg', params: { chat: this.p.i, id: m.i } })
        .then((d) => {
          if (d.err) return
          m.x = d.m.x
          delete m.c
          this.render(false)
        })
        .catch(() => {})
    },

    apply(evs) {
      let changed = false
      let arrived = false
      for (const e of evs) {
        if (e.c !== this.p.i) continue
        if (e.t === 'm') {
          const i = this.msgs.findIndex((m) => m.i === e.m.i)
          if (i >= 0) {
            this.msgs[i] = e.m
          } else {
            this.msgs.push(e.m)
            if (this.msgs.length > MAX + 15) this.msgs.shift()
            arrived = true
            if (!e.m.o) this.markRead()
          }
          changed = true
        } else if (e.t === 'r') {
          for (const m of this.msgs) {
            if (e.i.indexOf(m.i) >= 0 && m.o && RANK[e.k] > (RANK[m.k] || 0)) {
              m.k = e.k
              changed = true
            }
          }
        } else if (e.t === 'd') {
          const n = this.msgs.length
          this.msgs = this.msgs.filter((m) => e.i.indexOf(m.i) < 0)
          changed = changed || n !== this.msgs.length
        }
      }
      if (changed) this.render(arrived)
    },

    reply() {
      push({ url: 'page/reply/index.page', params: JSON.stringify({ i: this.p.i, n: this.p.n }) })
    },

    render(toBottom) {
      const cv = this.cv
      cv.clear()
      cv.title(this.p.n || 'Chat')
      if (this.loading) {
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Memuat…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      if (this.err && !this.msgs.length) {
        const v = errorView(this.err.code, this.err.msg)
        cv.message({ title: v.title, titleColor: C.warn, body: v.body, action: 'Coba lagi', click: () => {
          this.loading = true
          this.render(false)
          this.load()
        } })
        return
      }
      const x = L.side
      const w = W - 2 * L.side
      let y = L.top
      if (this.more && this.msgs.length < MAX) {
        cv.button({ x, y, w, h: px(48), text: 'Pesan sebelumnya', size: px(18), click: () => this.older() })
        y += px(58)
      }
      if (!this.msgs.length) {
        cv.text({ x, y: y + px(30), w, h: px(40), text: 'Belum ada pesan', size: px(20), color: C.sub, align: align.CENTER_H })
        y += px(100)
      }
      for (const m of this.msgs) y = this.bubble(m, y) + px(8)
      y += px(8)
      if (this.p.r) {
        cv.text({ x, y, w, h: px(56), text: 'Kamu bukan lagi anggota grup ini', size: px(18), color: C.sub, align: align.CENTER_H, wrap: true })
        y += px(56)
      } else {
        cv.button({ x, y, w, h: px(62), text: 'Balas', size: px(22), color: C.accent, down: C.accentDown, textColor: C.onAccent, click: () => this.reply() })
        y += px(62)
      }
      cv.rect(0, y, W, L.bottom, C.bg) // room to scroll clear of the edge
      y += L.bottom
      if (toBottom && y > H) scrollTo({ y: -(y - H) })
    },

    // bubble draws a message from y and returns where it ends.
    bubble(m, y) {
      const cv = this.cv
      const mine = !!m.o
      const pad = px(12)
      const maxW = W - 2 * L.side - px(44)
      const tw = maxW - 2 * pad
      const size = px(21)
      const sender = !mine && this.p.g && m.s ? m.s : ''
      const meta = m.t + (m.e ? ' · diedit' : '')
      const tick = mine ? TICKS[m.k] || '' : ''
      const metaW = textWidth(meta, px(14)) + (tick ? textWidth(tick, px(14)) + px(6) : 0)
      const bodyH = measure(m.x, size, tw)
      const innerW = Math.min(
        tw,
        Math.max(textWidth(m.x, size), metaW, sender ? textWidth(sender, px(16)) : 0, m.q ? textWidth(m.q, px(15)) : 0),
      )
      const senderH = sender ? px(24) : 0
      const quoteH = m.q ? px(28) : 0
      const bw = innerW + 2 * pad
      const bh = pad + senderH + quoteH + bodyH + px(24) + px(6)
      const bx = mine ? W - L.side - bw : L.side
      cv.rect(bx, y, bw, bh, mine ? C.mine : C.card, px(18))
      let ty = y + pad - px(2)
      if (sender) {
        cv.text({ x: bx + pad, y: ty, w: innerW, h: px(24), text: sender, size: px(16), color: avatarColor(sender) })
        ty += senderH
      }
      if (m.q) {
        cv.rect(bx + pad, ty + px(3), px(3), px(22), C.dim)
        cv.text({ x: bx + pad + px(9), y: ty, w: innerW - px(9), h: px(28), text: m.q, size: px(15), color: C.dim })
        ty += quoteH
      }
      cv.text({ x: bx + pad, y: ty, w: innerW, h: bodyH + px(4), text: m.x, size, wrap: true, valign: align.TOP })
      ty += bodyH + px(2)
      const metaColor = mine ? C.mineMeta : C.dim
      if (tick) {
        const tickW = textWidth(tick, px(14))
        cv.text({ x: bx + bw - pad - tickW, y: ty, w: tickW, h: px(22), text: tick, size: px(14), color: m.k === 'r' ? C.read : metaColor, align: align.RIGHT })
        cv.text({ x: bx + pad, y: ty, w: innerW - tickW - px(6), h: px(22), text: meta, size: px(14), color: metaColor, align: align.RIGHT })
      } else {
        cv.text({ x: bx + pad, y: ty, w: innerW, h: px(22), text: meta, size: px(14), color: metaColor, align: align.RIGHT })
      }
      let end = y + bh
      if (m.c) {
        const lw = px(150)
        cv.button({ x: mine ? bx + bw - lw : bx, y: end + px(4), w: lw, h: px(40), text: 'Selengkapnya', size: px(16), click: () => this.whole(m) })
        end += px(48)
      }
      return end
    },
  }),
)
