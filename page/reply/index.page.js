// Answering a chat: type or say it with the system keyboard, or pick a
// quick reply. Typed and spoken text is shown before it goes, unless the
// Zepp app's settings say not to; quick replies go at once. Once sent, the
// page goes back to the chat, which gets the message through its events.
// Opened from a message (page/msg) it answers that message: q is its ID,
// qs who sent it and qx its text, shown on top.

import { BasePage } from '@zeppos/zml/base-page'
import { showToast } from '@zos/interaction'
import { back } from '@zos/router'
import { localStorage } from '@zos/storage'
import { align, createKeyboard, deleteKeyboard, inputType } from '@zos/ui'
import { px } from '@zos/utils'
import { DEFAULT_QUICK } from '../../shared/convert'
import { ask, reason } from '../../utils/ask'
import { added } from '../../utils/msgcache'
import { nonce } from '../../utils/poll'
import { C, Canvas, H, L, W, errorView, measure } from '../../utils/ui'

function prefs() {
  try {
    const p = JSON.parse(localStorage.getItem('prefs', '') || 'null')
    if (p) return p
  } catch (e) {}
  return { quick: DEFAULT_QUICK, confirm: 1 }
}

Page(
  BasePage({
    onInit(params) {
      let p = {}
      try {
        p = JSON.parse(params || '{}')
      } catch (e) {}
      this.p = p
      this.cv = new Canvas()
      this.prefs = prefs()
      this.mode = 'menu' // menu, confirm or sending
      this.draft = ''
      this.via = ''
      this.sent = { text: '', nonce: '' } // the nonce goes with the text it was made for
    },

    onDestroy() {
      this.gone = true
    },

    build() {
      this.render()
      ask(this, 'prefs')
        .then((d) => {
          if (!d.ok) return
          this.prefs = { quick: d.quick, confirm: d.confirm, hide: d.hide }
          localStorage.setItem('prefs', JSON.stringify(this.prefs))
          if (this.mode === 'menu') this.render()
        })
        .catch(() => {})
    },

    keyboard(voice, text) {
      createKeyboard({
        inputType: voice ? inputType.VOICE : inputType.CHAR,
        text: text || '',
        onComplete: (_, result) => {
          deleteKeyboard()
          this.got((result && result.data) || '', voice ? 'voice' : 'keyboard')
        },
        onCancel: () => deleteKeyboard(),
      })
    },

    got(text, via) {
      text = text.trim()
      if (!text) return
      if (this.prefs.confirm) {
        this.mode = 'confirm'
        this.draft = text
        this.via = via
        this.render()
        return
      }
      this.send(text)
    },

    send(text) {
      if (this.mode === 'sending') return
      if (this.sent.text !== text) this.sent = { text, nonce: nonce() }
      const was = this.mode
      this.mode = 'sending'
      this.render()
      ask(this, 'send', { chat: this.p.i, text, replyTo: this.p.q || '', nonce: this.sent.nonce })
        .then((d) => {
          if (this.gone) return
          if (d.err) {
            showToast({ content: errorView(d.err, d.msg).short })
            this.mode = was
            this.render()
            return
          }
          added(this.p.i, d.m) // the chat shows it as it opens again
          showToast({ content: 'Sent' })
          back()
        })
        .catch((e) => {
          if (this.gone) return
          showToast({ content: errorView('phone', reason(e)).short })
          this.mode = was
          this.render()
        })
    },

    // quote draws the message being answered, when there's one, at y and
    // returns where what follows goes.
    quote(y) {
      if (!this.p.q) return y
      const x = L.side
      const w = W - 2 * L.side
      const cv = this.cv
      cv.rect(x, y, w, px(62), C.card, px(14))
      cv.rect(x + px(10), y + px(10), px(4), px(42), C.accent, px(2))
      cv.text({ x: x + px(24), y: y + px(4), w: w - px(36), h: px(28), text: this.p.qs || 'Message', size: px(16), color: C.accent })
      cv.text({ x: x + px(24), y: y + px(30), w: w - px(36), h: px(28), text: this.p.qx || '', size: px(17), color: C.sub })
      return y + px(74)
    },

    render() {
      const cv = this.cv
      cv.clear()
      const x = L.side
      const w = W - 2 * L.side
      if (this.mode === 'sending') {
        cv.title('Reply')
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Sending…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      if (this.mode === 'confirm') {
        cv.title('Send to ' + (this.p.n || '') + '?')
        let y = this.quote(L.top + px(8))
        const pad = px(18)
        const size = px(24)
        const th = Math.min(measure(this.draft, size, w - 2 * pad), H - y - px(200))
        const bh = th + px(36) + 2 * pad
        cv.rect(x, y, w, bh, C.card, px(24))
        cv.text({ x: x + pad, y: y + pad, w: w - 2 * pad, h: th + px(4), text: this.draft, size, wrap: true, valign: align.TOP })
        cv.text({ x: x + pad, y: y + pad + th + px(8), w: w - 2 * pad, h: px(26), text: this.via === 'voice' ? 'From voice' : 'From keyboard', size: px(16), color: C.dim })
        y += bh + px(18)
        const half = Math.floor((w - px(12)) / 2)
        cv.button({ x, y, w: half, h: px(60), text: 'Edit', size: px(21), click: () => {
          this.mode = 'menu'
          this.render()
          this.keyboard(this.via === 'voice', this.via === 'voice' ? '' : this.draft)
        } })
        cv.button({ x: x + half + px(12), y, w: half, h: px(60), text: 'Send', size: px(21), color: C.accent, down: C.accentDown, textColor: C.onAccent, click: () => this.send(this.draft) })
        y += px(60)
        cv.rect(0, y, W, L.bottom, C.bg)
        return
      }
      cv.title('Reply to ' + (this.p.n || ''))
      let y = this.quote(L.top + px(4))
      const half = Math.floor((w - px(12)) / 2)
      cv.button({ x, y, w: half, h: px(92), radius: px(24), text: 'Type', size: px(21), click: () => this.keyboard(false) })
      cv.button({ x: x + half + px(12), y, w: half, h: px(92), radius: px(24), text: 'Voice', size: px(21), click: () => this.keyboard(true) })
      y += px(92) + px(16)
      for (const q of this.prefs.quick || DEFAULT_QUICK) {
        cv.button({ x, y, w, h: px(60), text: q, size: px(21), color: 0x1a1e20, click: () => this.send(q) })
        y += px(60) + px(10)
      }
      cv.rect(0, y, W, L.bottom, C.bg)
    },
  }),
)
