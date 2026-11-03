// A message's picture: a photo, a sticker, or a video's or GIF's preview.
// It loads only when opened. The computer fits it to a square box (a
// photo's on black around it), the phone converts it, and it comes over
// Bluetooth as a file (utils/files.js) while the page counts how much has
// come. The file goes when the page closes.

import { BasePage } from '@zeppos/zml/base-page'
import { align, prop, widget } from '@zos/ui'
import { px } from '@zos/utils'
import { ask, reason } from '../../utils/ask'
import { onFile, remove } from '../../utils/files'
import { C, Canvas, H, L, W, errorView } from '../../utils/ui'

const TITLES = { i: 'Photo', s: 'Sticker', v: 'Video preview' }

// box is the picture's side: stickers are smaller, and every pixel takes
// Bluetooth time.
function box(kind) {
  const room = Math.min(W - 2 * L.side, H - L.top - L.bottom)
  return Math.min(room, kind === 's' ? px(240) : px(320))
}

Page(
  BasePage({
    onInit(params) {
      let p = {}
      try {
        p = JSON.parse(params || '{}')
      } catch (e) {}
      this.p = p // c chat, i message, k kind (see TITLES), n chat's name
      this.cv = new Canvas()
      this.mode = 'loading' // loading, sending, shown or error
      this.err = null
      this.path = ''
      this.gone = false
      this.status = null // the text widget that counts what has come
    },

    build() {
      this.off = onFile((e) => this.file(e))
      this.render()
      this.load()
    },

    onDestroy() {
      this.gone = true
      this.off()
      remove(this.path)
    },

    load() {
      const side = box(this.p.k)
      ask(this, 'photo', { chat: this.p.c, id: this.p.i, w: side, h: side }, { timeout: 60000 }).then(
        (d) => {
          if (this.gone || this.mode !== 'loading') return
          if (d.err) {
            this.fail(d.err, d.msg)
            return
          }
          this.mode = 'sending'
          this.render()
        },
        (e) => {
          if (!this.gone && this.mode === 'loading') this.fail('phone', reason(e))
        },
      )
    },

    file(e) {
      if (this.gone || e.params.kind !== 'ph' || e.params.id !== this.p.i || this.mode === 'shown') return
      if (e.state === 'done') {
        this.path = e.file.filePath
        this.mode = 'shown'
        this.render()
      } else if (e.state === 'error') {
        this.fail('server', "The picture didn't reach the watch")
      } else {
        if (this.mode !== 'sending') {
          this.mode = 'sending'
          this.render()
        }
        if (this.status && e.size) {
          const pct = Math.min(99, Math.floor((e.loaded * 100) / e.size))
          this.status.setProperty(prop.MORE, { text: pct + '%' })
        }
      }
    },

    fail(code, msg) {
      this.err = { code, msg }
      this.mode = 'error'
      this.render()
    },

    retry() {
      this.err = null
      this.mode = 'loading'
      this.render()
      this.load()
    },

    render() {
      const cv = this.cv
      cv.clear()
      this.status = null
      cv.title(TITLES[this.p.k] || 'Photo')
      const x = L.side
      const w = W - 2 * L.side
      if (this.mode === 'error') {
        const v = errorView(this.err.code, this.err.msg)
        cv.message({ title: v.title, titleColor: C.warn, body: v.body, action: 'Try again', click: () => this.retry() })
        return
      }
      const side = box(this.p.k)
      const top = L.top + Math.max(0, Math.floor((H - L.top - L.bottom - side) / 2))
      if (this.mode === 'shown') {
        cv.add(widget.IMG, { x: Math.floor((W - side) / 2), y: top, w: side, h: side, src: this.path })
        return
      }
      // A box where the picture will be, and what's happening.
      cv.rect(Math.floor((W - side) / 2), top, side, side, C.card, px(20))
      const mid = top + Math.floor(side / 2)
      cv.text({ x, y: mid - px(36), w, h: px(36), text: this.mode === 'loading' ? 'Getting the picture…' : 'Sending to the watch…', size: px(20), color: C.text, align: align.CENTER_H })
      this.status = cv.text({ x, y: mid, w, h: px(30), text: this.mode === 'loading' ? 'from your computer' : '0%', size: px(16), color: C.sub, align: align.CENTER_H })
    },
  }),
)
