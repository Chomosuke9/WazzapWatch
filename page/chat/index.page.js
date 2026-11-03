// A conversation: its newest 15 messages, older ones on request (at most
// MAX in memory), and a Reply button after the newest. Opening it
// marks the chat read; it follows new messages and receipts while open.
// A chat opened lately shows its kept messages at once (utils/msgcache.js)
// while the newest load.

import { BasePage } from '@zeppos/zml/base-page'
import { scrollTo } from '@zos/page'
import { push } from '@zos/router'
import { align, event, widget } from '@zos/ui'
import { px } from '@zos/utils'
import { ask, failed, reason } from '../../utils/ask'
import { emojiImage } from '../../utils/emoji'
import { cached, keep } from '../../utils/msgcache'
import { poll } from '../../utils/poll'
import { C, Canvas, H, L, W, avatarColor, errorView, measure, textWidth } from '../../utils/ui'

// MAX is how many messages the page keeps; older ones can't be loaded past it.
const MAX = 45

const TICKS = { '!': '!', p: '•', s: '✓', d: '✓✓', r: '✓✓' }
const RANK = { '!': 0, p: 1, s: 2, d: 3, r: 4 }

// DOUBLE_TAP is the longest gap between the two taps that open a message, in ms.
const DOUBLE_TAP = 450

// VIEW labels the button that opens a message's picture (shared/convert.js's p).
const VIEW = { i: 'View photo', s: 'View sticker', v: 'View preview' }

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
      const c = cached(p.i)
      if (c) {
        this.msgs = c.msgs
        this.more = c.more
        this.loading = false
      }
    },

    build() {
      this.render(!this.loading)
      // Follow changes from now on, then load: nothing falls in between.
      this.stop = poll(this, '', (evs) => this.apply(evs), () => this.load())
      this.load()
      this.markRead()
    },

    onDestroy() {
      this.gone = true
      if (this.stop) this.stop()
    },

    // remember keeps the messages shown for the next time the chat opens.
    remember() {
      if (this.msgs.length) keep(this.p.i, this.msgs, this.more)
    },

    markRead() {
      ask(this, 'read', { chat: this.p.i }).catch(() => {})
    },

    load() {
      ask(this, 'msgs', { chat: this.p.i }).then(
        (d) => {
          if (this.gone) return
          const was = this.loading
          const before = JSON.stringify(this.msgs)
          this.loading = false
          if (d.err) {
            this.err = { code: d.err, msg: d.msg }
          } else {
            this.err = null
            // Older messages kept from before stay above the newest page,
            // when it reaches back to them.
            const at = d.m.length ? this.msgs.findIndex((m) => m.i === d.m[0].i) : -1
            if (at > 0) {
              this.msgs = this.msgs.slice(0, at).concat(d.m)
            } else {
              this.msgs = d.m
              this.more = !!d.more
            }
            this.remember()
            if (!was && JSON.stringify(this.msgs) === before) return // nothing new since the kept ones
          }
          try {
            this.render(true)
          } catch (e) {
            this.err = { code: 'bug', msg: failed('msgs', e) }
            this.msgs = []
            this.render(false)
          }
        },
        (e) => {
          if (this.gone) return
          this.loading = false
          this.err = { code: 'phone', msg: reason(e) }
          this.render(true)
        },
      )
    },

    older() {
      const first = this.msgs[0]
      if (!first) return
      ask(this, 'msgs', { chat: this.p.i, before: first.i })
        .then((d) => {
          if (d.err) return
          this.msgs = d.m.concat(this.msgs)
          this.more = !!d.more
          this.remember()
          this.render(false)
          scrollTo({ y: 0 })
        })
        .catch(() => {})
    },

    // whole loads all of a message whose text was cut.
    whole(m) {
      ask(this, 'msg', { chat: this.p.i, id: m.i })
        .then((d) => {
          if (d.err) return
          m.x = d.m.x
          delete m.c
          this.remember()
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
      if (changed) {
        this.remember()
        this.render(arrived)
      }
    },

    reply() {
      push({ url: 'page/reply/index.page', params: JSON.stringify({ i: this.p.i, n: this.p.n }) })
    },

    // tapped opens the message's page on the second of two quick taps on
    // it: one tap alone, or a scroll that ends on a bubble, does nothing.
    tapped(m) {
      const now = Date.now()
      const last = this.lastTap
      this.lastTap = { id: m.i, at: now }
      if (last && last.id === m.i && now - last.at < DOUBLE_TAP) {
        this.lastTap = null
        this.act(m)
      }
    },

    // act opens what can be done to a message: react, or reply to it.
    act(m) {
      const who = m.o ? 'You' : m.s || this.p.n
      const x = m.x.length > 140 ? m.x.slice(0, 140) + '…' : m.x
      push({ url: 'page/msg/index.page', params: JSON.stringify({ c: this.p.i, n: this.p.n, i: m.i, x, s: who, y: m.y || '' }) })
    },

    // reactions draws a message's reactions in a pill under its bubble, on
    // its side (edge is the bubble's outer edge), and returns where it ends.
    reactions(m, edge, y, mine) {
      const cv = this.cv
      const pad = px(10)
      const gap = px(4)
      const shown = m.r.slice(0, 3)
      const total = m.r.reduce((n, r) => n + r[1], 0)
      const label = total > 1 ? String(total) : ''
      const items = shown.map((r) => {
        const img = emojiImage(r[0], 's')
        return { img, text: r[0], w: img ? 28 : textWidth(r[0], px(20)) }
      })
      const labelW = label ? textWidth(label, px(16)) + gap : 0
      const pw = 2 * pad + items.reduce((n, it) => n + it.w, 0) + gap * (items.length - 1) + labelW
      const ph = px(36)
      const px0 = mine ? edge - pw - px(8) : edge + px(8)
      const top = y - px(6) // over the bubble's edge, as WhatsApp does
      cv.rect(px0 - px(2), top - px(2), pw + px(4), ph + px(4), C.bg, Math.floor(ph / 2) + px(2))
      cv.rect(px0, top, pw, ph, m.y ? 0x1f3b2d : C.card, Math.floor(ph / 2))
      let ix = px0 + pad
      for (const it of items) {
        if (it.img) cv.add(widget.IMG, { x: ix, y: top + Math.floor((ph - 28) / 2), src: it.img })
        else cv.text({ x: ix, y: top, w: it.w + px(2), h: ph, text: it.text, size: px(20) })
        ix += it.w + gap
      }
      if (label) cv.text({ x: ix, y: top, w: labelW, h: ph, text: label, size: px(16), color: C.sub })
      return top + ph
    },

    // view opens a message's picture, which loads only then.
    view(m) {
      push({ url: 'page/photo/index.page', params: JSON.stringify({ c: this.p.i, i: m.i, k: m.p, n: this.p.n }) })
    },

    render(toBottom) {
      const cv = this.cv
      cv.clear()
      cv.title(this.p.n || 'Chat')
      if (this.loading) {
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Loading…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      if (this.err && !this.msgs.length) {
        const v = errorView(this.err.code, this.err.msg)
        cv.message({ title: v.title, titleColor: C.warn, body: v.body, action: 'Try again', click: () => {
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
        cv.button({ x, y, w, h: px(48), text: 'Earlier messages', size: px(18), click: () => this.older() })
        y += px(58)
      }
      if (!this.msgs.length) {
        cv.text({ x, y: y + px(30), w, h: px(40), text: 'No messages yet', size: px(20), color: C.sub, align: align.CENTER_H })
        y += px(100)
      }
      for (const m of this.msgs) y = this.bubble(m, y) + px(8)
      y += px(8)
      if (this.p.r) {
        cv.text({ x, y, w, h: px(56), text: "You're no longer in this group", size: px(18), color: C.sub, align: align.CENTER_H, wrap: true })
        y += px(56)
      } else {
        cv.button({ x, y, w, h: px(62), text: 'Reply', size: px(22), color: C.accent, down: C.accentDown, textColor: C.onAccent, click: () => this.reply() })
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
      const meta = m.t + (m.e ? ' · edited' : '')
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
      // A double tap on any part of the bubble opens the message's page.
      const parts = [cv.rect(bx, y, bw, bh, mine ? C.mine : C.card, px(18))]
      let ty = y + pad - px(2)
      if (sender) {
        parts.push(cv.text({ x: bx + pad, y: ty, w: innerW, h: px(24), text: sender, size: px(16), color: avatarColor(sender) }))
        ty += senderH
      }
      if (m.q) {
        cv.rect(bx + pad, ty + px(3), px(3), px(22), C.dim)
        parts.push(cv.text({ x: bx + pad + px(9), y: ty, w: innerW - px(9), h: px(28), text: m.q, size: px(15), color: C.dim }))
        ty += quoteH
      }
      parts.push(cv.text({ x: bx + pad, y: ty, w: innerW, h: bodyH + px(4), text: m.x, size, wrap: true, valign: align.TOP }))
      ty += bodyH + px(2)
      const metaColor = mine ? C.mineMeta : C.dim
      if (tick) {
        const tickW = textWidth(tick, px(14))
        cv.text({ x: bx + bw - pad - tickW, y: ty, w: tickW, h: px(22), text: tick, size: px(14), color: m.k === 'r' ? C.read : metaColor, align: align.RIGHT })
        cv.text({ x: bx + pad, y: ty, w: innerW - tickW - px(6), h: px(22), text: meta, size: px(14), color: metaColor, align: align.RIGHT })
      } else {
        cv.text({ x: bx + pad, y: ty, w: innerW, h: px(22), text: meta, size: px(14), color: metaColor, align: align.RIGHT })
      }
      if (!m.z && !this.p.r) {
        for (const part of parts) part.addEventListener(event.CLICK_UP, () => this.tapped(m))
      }
      let end = y + bh
      if (m.r) end = this.reactions(m, mine ? bx + bw : bx, end, mine)
      // Buttons under the bubble, on its side.
      const under = (text, click) => {
        const lw = px(170)
        cv.button({ x: mine ? bx + bw - lw : bx, y: end + px(4), w: lw, h: px(40), text, size: px(16), click })
        end += px(48)
      }
      if (m.p) under(VIEW[m.p], () => this.view(m))
      if (m.c) under('Read more', () => this.whole(m))
      return end
    },
  }),
)
