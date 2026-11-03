// The chat list: the latest 20 chats, then more on request. It shows the
// list kept from last time at once, asks the computer for the current one,
// and follows changes while it's open.

import { BasePage } from '@zeppos/zml/base-page'
import { push } from '@zos/router'
import { localStorage } from '@zos/storage'
import { align } from '@zos/ui'
import { px } from '@zos/utils'
import { upsertChat } from '../../shared/convert'
import { poll } from '../../utils/poll'
import { C, Canvas, H, L, W, avatarColor, errorView, initial, textWidth } from '../../utils/ui'

const ROW = px(86)

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key, '') || 'null')
  } catch (e) {
    return null
  }
}

function save(key, v) {
  localStorage.setItem(key, JSON.stringify(v))
}

Page(
  BasePage({
    onInit() {
      this.cv = new Canvas()
      this.chats = load('chats') || []
      this.more = false
      this.err = null
      this.loading = this.chats.length === 0
      const prefs = load('prefs')
      this.hide = !!(prefs && prefs.hide)
      this.stop = null
    },

    build() {
      this.render()
      this.loadPrefs()
      this.refresh()
    },

    onDestroy() {
      if (this.stop) this.stop()
    },

    // loadPrefs reads the settings made in the Zepp app; the reply page
    // reads them from storage too.
    loadPrefs() {
      this.request({ method: 'prefs', params: {} })
        .then((d) => {
          if (!d.ok) return
          save('prefs', { quick: d.quick, confirm: d.confirm, hide: d.hide })
          if (!!d.hide !== this.hide) {
            this.hide = !!d.hide
            this.render()
          }
        })
        .catch(() => {})
    },

    refresh() {
      this.request({ method: 'chats', params: {} })
        .then((d) => {
          if (d.err) {
            this.fail(d.err, d.msg)
            return
          }
          this.err = null
          this.loading = false
          this.chats = d.c
          this.more = !!d.more
          save('chats', this.chats)
          this.render()
          if (this.stop) this.stop()
          this.stop = poll(this, d.k, (evs) => this.apply(evs), () => this.refresh())
        })
        .catch(() => this.fail('phone'))
    },

    fail(code, msg) {
      this.loading = false
      this.err = { code, msg }
      this.render()
    },

    retry() {
      this.err = null
      this.loading = this.chats.length === 0
      this.render()
      this.refresh()
    },

    loadMore() {
      const last = this.chats[this.chats.length - 1]
      if (!last) return
      this.request({ method: 'chats', params: { after: last.i } })
        .then((d) => {
          if (d.err) return
          const have = new Set(this.chats.map((c) => c.i))
          this.chats = this.chats.concat(d.c.filter((c) => !have.has(c.i)))
          this.more = !!d.more
          this.render()
        })
        .catch(() => {})
    },

    apply(evs) {
      let changed = false
      for (const e of evs) {
        if (e.t === 'c') {
          this.chats = upsertChat(this.chats, e.c)
          changed = true
        } else if (e.t === 'x') {
          this.refresh()
          return
        }
      }
      if (changed) {
        save('chats', this.chats.slice(0, 20))
        this.render()
      }
    },

    open(c) {
      if (c.u) {
        c.u = 0 // opening it reads it
        this.render()
      }
      push({ url: 'page/chat/index.page', params: JSON.stringify({ i: c.i, n: c.n, g: c.g ? 1 : 0, r: c.r ? 1 : 0 }) })
    },

    render() {
      const cv = this.cv
      cv.clear()
      cv.title('Chat')
      if (this.loading) {
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Memuat…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      if (this.err && !this.chats.length) {
        const v = errorView(this.err.code, this.err.msg)
        cv.message({ title: v.title, titleColor: C.warn, body: v.body, action: 'Coba lagi', click: () => this.retry() })
        return
      }
      const x = L.side
      const w = W - 2 * L.side
      let y = L.top
      if (this.err) {
        // The list kept from last time, under a bar that says why it's old.
        cv.button({
          x, y, w, h: px(48), radius: px(14),
          text: errorView(this.err.code).title + ' · coba lagi',
          size: px(17), color: 0x3a2e14, down: 0x4a3b1a, textColor: C.warn,
          click: () => this.retry(),
        })
        y += px(56)
      }
      if (!this.chats.length) {
        cv.text({ x, y: y + px(40), w, h: px(40), text: 'Belum ada chat', size: px(20), color: C.sub, align: align.CENTER_H })
      }
      for (const c of this.chats) {
        this.row(c, y)
        y += ROW
      }
      if (this.more) {
        y += px(10)
        cv.button({ x, y, w, h: px(52), text: 'Muat lagi', size: px(19), click: () => this.loadMore() })
        y += px(52)
      }
      cv.rect(0, y, W, L.bottom, C.bg) // room to scroll the last row clear of the edge
    },

    row(c, y) {
      const cv = this.cv
      const x = L.side
      const w = W - 2 * L.side
      cv.button({ x, y, w, h: ROW, radius: px(16), color: C.bg, down: C.card, click: () => this.open(c) })
      const r = px(29)
      const cy = y + Math.floor(ROW / 2)
      cv.circle(x + r, cy, r, avatarColor(c.i))
      cv.text({ x, y: cy - r, w: 2 * r, h: 2 * r, text: initial(c.n), size: px(25), color: C.onAccent, align: align.CENTER_H })
      const tx = x + 2 * r + px(14)
      const tw = x + w - tx
      const timeW = px(84)
      const unread = c.u && !c.m
      cv.text({ x: tx, y: y + px(10), w: tw - timeW - px(6), h: px(34), text: c.n, size: px(23) })
      cv.text({ x: x + w - timeW, y: y + px(13), w: timeW, h: px(28), text: c.t, size: px(16), color: unread ? C.accent : C.dim, align: align.RIGHT })
      let pw = tw
      if (c.u) {
        const label = c.u > 99 ? '99+' : String(c.u)
        const bw = Math.max(px(30), textWidth(label, px(16)) + px(16))
        const bx = x + w - bw
        const by = y + px(47)
        cv.rect(bx, by, bw, px(30), c.m ? C.muted : C.accent, px(15))
        cv.text({ x: bx, y: by, w: bw, h: px(30), text: label, size: px(16), color: c.m ? 0xffffff : C.onAccent, align: align.CENTER_H })
        pw -= bw + px(8)
      }
      if (!this.hide && c.v) {
        cv.text({ x: tx, y: y + px(46), w: pw, h: px(32), text: c.v, size: px(19), color: C.sub })
      }
      cv.rect(tx, y + ROW - 1, x + w - tx, 1, C.line)
    },
  }),
)
