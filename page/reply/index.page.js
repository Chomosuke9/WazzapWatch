// Answering a chat: type or say it with the system keyboard, or pick a
// quick reply. Typed and spoken text is shown before it goes, unless the
// Zepp app's settings say not to; quick replies go at once. Once sent, the
// page goes back to the chat, which gets the message through its events.

import { BasePage } from '@zeppos/zml/base-page'
import { showToast } from '@zos/interaction'
import { back } from '@zos/router'
import { localStorage } from '@zos/storage'
import { align, createKeyboard, deleteKeyboard, inputType } from '@zos/ui'
import { px } from '@zos/utils'
import { DEFAULT_QUICK } from '../../shared/convert'
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

    build() {
      this.render()
      this.request({ method: 'prefs', params: {} })
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
      this.request({ method: 'send', params: { chat: this.p.i, text, nonce: this.sent.nonce } })
        .then((d) => {
          if (d.err) {
            showToast({ content: errorView(d.err, d.msg).title })
            this.mode = was
            this.render()
            return
          }
          showToast({ content: 'Terkirim' })
          back()
        })
        .catch(() => {
          showToast({ content: errorView('phone').title })
          this.mode = was
          this.render()
        })
    },

    render() {
      const cv = this.cv
      cv.clear()
      const x = L.side
      const w = W - 2 * L.side
      if (this.mode === 'sending') {
        cv.title('Balas')
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Mengirim…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      if (this.mode === 'confirm') {
        cv.title('Kirim ke ' + (this.p.n || '') + '?')
        let y = L.top + px(8)
        const pad = px(18)
        const size = px(24)
        const th = Math.min(measure(this.draft, size, w - 2 * pad), H - y - px(200))
        const bh = th + px(36) + 2 * pad
        cv.rect(x, y, w, bh, C.card, px(24))
        cv.text({ x: x + pad, y: y + pad, w: w - 2 * pad, h: th + px(4), text: this.draft, size, wrap: true, valign: align.TOP })
        cv.text({ x: x + pad, y: y + pad + th + px(8), w: w - 2 * pad, h: px(26), text: this.via === 'voice' ? 'Dari suara' : 'Dari keyboard', size: px(16), color: C.dim })
        y += bh + px(18)
        const half = Math.floor((w - px(12)) / 2)
        cv.button({ x, y, w: half, h: px(60), text: 'Ubah', size: px(21), click: () => {
          this.mode = 'menu'
          this.render()
          this.keyboard(this.via === 'voice', this.via === 'voice' ? '' : this.draft)
        } })
        cv.button({ x: x + half + px(12), y, w: half, h: px(60), text: 'Kirim', size: px(21), color: C.accent, down: C.accentDown, textColor: C.onAccent, click: () => this.send(this.draft) })
        y += px(60)
        cv.rect(0, y, W, L.bottom, C.bg)
        return
      }
      cv.title('Balas ' + (this.p.n || ''))
      let y = L.top + px(4)
      const half = Math.floor((w - px(12)) / 2)
      cv.button({ x, y, w: half, h: px(92), radius: px(24), text: 'Ketik', size: px(21), click: () => this.keyboard(false) })
      cv.button({ x: x + half + px(12), y, w: half, h: px(92), radius: px(24), text: 'Suara', size: px(21), click: () => this.keyboard(true) })
      y += px(92) + px(16)
      for (const q of this.prefs.quick || DEFAULT_QUICK) {
        cv.button({ x, y, w, h: px(60), text: q, size: px(21), color: 0x1a1e20, click: () => this.send(q) })
        y += px(60) + px(10)
      }
      cv.rect(0, y, W, L.bottom, C.bg)
    },
  }),
)
