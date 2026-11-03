// What can be done to a message, opened by tapping it in a chat: react with
// one of WhatsApp's six emoji (yours again takes it back), take your
// reaction back, or reply to the message. The chat gets the change through
// its events.

import { BasePage } from '@zeppos/zml/base-page'
import { showToast } from '@zos/interaction'
import { back, replace } from '@zos/router'
import { align, event, widget } from '@zos/ui'
import { px } from '@zos/utils'
import { ask, reason } from '../../utils/ask'
import { QUICK, emojiImage, sameEmoji } from '../../utils/emoji'
import { C, Canvas, H, L, W, errorView, measure } from '../../utils/ui'

Page(
  BasePage({
    onInit(params) {
      let p = {}
      try {
        p = JSON.parse(params || '{}')
      } catch (e) {}
      this.p = p // c chat, n its name, i message, x its text, s who sent it, y your reaction
      this.cv = new Canvas()
      this.busy = false
      this.gone = false
    },

    build() {
      this.render()
    },

    onDestroy() {
      this.gone = true
    },

    react(emoji) {
      if (this.busy) return
      this.busy = true
      this.render()
      ask(this, 'react', { chat: this.p.c, id: this.p.i, emoji }).then(
        (d) => {
          if (this.gone) return
          if (d.err) {
            showToast({ content: errorView(d.err, d.msg).short })
            this.busy = false
            this.render()
            return
          }
          back()
        },
        (e) => {
          if (this.gone) return
          showToast({ content: errorView('phone', reason(e)).short })
          this.busy = false
          this.render()
        },
      )
    },

    reply() {
      // In the page's place, so sending goes back to the chat.
      replace({
        url: 'page/reply/index.page',
        params: JSON.stringify({ i: this.p.c, n: this.p.n, q: this.p.i, qs: this.p.s, qx: this.p.x }),
      })
    },

    render() {
      const cv = this.cv
      cv.clear()
      cv.title('Message')
      const x = L.side
      const w = W - 2 * L.side
      if (this.busy) {
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Reacting…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      let y = L.top + px(4)

      // The message, as a reminder.
      const pad = px(14)
      const th = Math.min(measure(this.p.x, px(19), w - 2 * pad), px(78))
      cv.rect(x, y, w, th + px(40) + pad, C.card, px(18))
      cv.text({ x: x + pad, y: y + px(8), w: w - 2 * pad, h: px(28), text: this.p.s || '', size: px(16), color: C.accent })
      cv.text({ x: x + pad, y: y + px(36), w: w - 2 * pad, h: th + px(4), text: this.p.x || '', size: px(19), color: C.sub, wrap: true, valign: align.TOP })
      y += th + px(40) + pad + px(14)

      // The six reactions, three to a row; yours is lit.
      const cols = 3
      const gap = px(10)
      const cw = Math.floor((w - gap * (cols - 1)) / cols)
      const ch = px(84)
      QUICK.forEach((q, i) => {
        const cx = x + (i % cols) * (cw + gap)
        const cy = y + Math.floor(i / cols) * (ch + gap)
        const mine = sameEmoji(q.e, this.p.y)
        const pick = () => this.react(mine ? '' : q.e)
        cv.button({ x: cx, y: cy, w: cw, h: ch, radius: px(22), color: mine ? 0x1f4d3a : C.card, down: C.cardDown, click: pick })
        const img = cv.add(widget.IMG, { x: cx + Math.floor((cw - 60) / 2), y: cy + Math.floor((ch - 60) / 2), src: emojiImage(q.e, 'l') })
        img.addEventListener(event.CLICK_UP, pick)
      })
      y += 2 * ch + gap + px(18)

      cv.button({ x, y, w, h: px(60), text: 'Reply', size: px(21), color: C.accent, down: C.accentDown, textColor: C.onAccent, click: () => this.reply() })
      y += px(70)
      if (this.p.y) {
        cv.button({ x, y, w, h: px(56), text: 'Remove reaction', size: px(19), click: () => this.react('') })
        y += px(66)
      }
      cv.rect(0, y, W, L.bottom, C.bg) // room to scroll clear of the edge
    },
  }),
)
