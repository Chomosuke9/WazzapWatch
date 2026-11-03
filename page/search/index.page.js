// Search: what to look for, typed or spoken, then the chats whose name has
// it and the messages whose text does. A result opens its chat.

import { BasePage } from '@zeppos/zml/base-page'
import { push } from '@zos/router'
import { align, prop, widget } from '@zos/ui'
import { px } from '@zos/utils'
import { ask, reason } from '../../utils/ask'
import { Loader, moreComing } from '../../utils/avatars'
import { BUTTON_ROW, FOUND, HEADING, chatRow, chatRows, listData } from '../../utils/chatrows'
import { openKeyboard } from '../../utils/keyboard'
import { C, Canvas, H, L, W, errorView } from '../../utils/ui'

Page(
  BasePage({
    onInit() {
      this.cv = new Canvas()
      this.q = ''
      this.mode = 'menu' // menu, searching, results or error
      this.chats = []
      this.found = []
      this.done = true
      this.err = null
      this.gone = false
      this.targets = [] // what each row of the list opens
      this.list = null
      // A picture arriving updates the results' rows, keeping their place,
      // when it's one of theirs. Every update is a hitch, so while more
      // are coming they go in together, every few seconds.
      this.timer = null
      this.avatars = new Loader(this, () => {
        if (this.timer && !moreComing()) {
          clearTimeout(this.timer)
          this.timer = null
        }
        if (!this.timer) this.timer = setTimeout(() => this.pictures(), moreComing() ? 3000 : 400)
      })
    },

    pictures() {
      this.timer = null
      if (this.gone || !this.list) return
      const data = this.results()
      const sig = JSON.stringify(data)
      if (sig === this.sig) return
      this.sig = sig
      this.list.setProperty(prop.UPDATE_DATA, Object.assign(data, { on_page: 1 }))
    },

    build() {
      this.render()
    },

    onDestroy() {
      this.gone = true
      if (this.timer) clearTimeout(this.timer)
      this.avatars.stop()
    },

    prompt(voice) {
      openKeyboard(voice, voice ? '' : this.q, (q) => this.search(q))
    },

    search(q) {
      this.q = q
      this.mode = 'searching'
      this.render()
      ask(this, 'search', { q }, { timeout: 40000 }).then(
        (d) => {
          if (this.gone || q !== this.q) return
          if (d.err) {
            this.err = { code: d.err, msg: d.msg }
            this.mode = 'error'
          } else {
            this.chats = d.c
            this.found = d.m
            this.done = !!d.done
            this.mode = 'results'
            this.avatars.want(d.c.map((c) => c.i))
          }
          this.render()
        },
        (e) => {
          if (this.gone || q !== this.q) return
          this.err = { code: 'phone', msg: reason(e) }
          this.mode = 'error'
          this.render()
        },
      )
    },

    openChat(id, name, group, readOnly) {
      push({ url: 'page/chat/index.page', params: JSON.stringify({ i: id, n: name, g: group ? 1 : 0, r: readOnly ? 1 : 0 }) })
    },

    render() {
      const cv = this.cv
      cv.clear()
      this.list = null
      cv.title('Search')
      const x = L.side
      const w = W - 2 * L.side
      if (this.mode === 'menu') {
        let y = L.top + px(4)
        cv.text({ x, y, w, h: px(56), text: 'Look for a chat by name, or a message by its words.', size: px(18), color: C.sub, wrap: true, valign: align.TOP })
        y += px(70)
        const half = Math.floor((w - px(12)) / 2)
        cv.button({ x, y, w: half, h: px(92), radius: px(24), text: 'Type', size: px(21), click: () => this.prompt(false) })
        cv.button({ x: x + half + px(12), y, w: half, h: px(92), radius: px(24), text: 'Voice', size: px(21), click: () => this.prompt(true) })
        return
      }
      if (this.mode === 'searching') {
        cv.text({ x, y: Math.floor(H / 2) - px(40), w, h: px(40), text: 'Searching…', size: px(22), color: C.sub, align: align.CENTER_H })
        cv.text({ x, y: Math.floor(H / 2), w, h: px(36), text: '“' + this.q + '”', size: px(18), color: C.dim, align: align.CENTER_H })
        return
      }
      if (this.mode === 'error') {
        const v = errorView(this.err.code, this.err.msg)
        cv.message({ title: v.title, titleColor: C.warn, body: v.body, action: 'Try again', click: () => this.search(this.q) })
        return
      }
      const data = this.results()
      const y = L.top
      if (data.data_count === 1) {
        cv.button({ x, y, w, h: px(56), text: data.data_array[0].n, size: px(19), click: () => this.prompt(false) })
        cv.text({ x, y: y + px(90), w, h: px(40), text: 'Nothing found', size: px(20), color: C.sub, align: align.CENTER_H })
        return
      }
      const config = chatRows(w)
      this.sig = JSON.stringify(data)
      this.list = cv.add(widget.SCROLL_LIST, Object.assign({
        x, y, w, h: H - y,
        item_space: px(4),
        item_config: config,
        item_config_count: config.length,
        item_click_func: (_, i) => {
          const t = this.targets[i]
          if (!t) return
          if (t.again) this.prompt(false)
          else if (t.chat) this.openChat(t.chat.i, t.chat.n, t.chat.g, t.chat.r)
          else this.openChat(t.found.h, t.found.n, t.found.g, false)
        },
      }, data))
    },

    // results is the list's data: search again, then the chats and the
    // messages found. targets says what each row opens.
    results() {
      const rows = [{ n: '“' + this.q + '” · search again' }]
      const kinds = [BUTTON_ROW]
      const targets = [{ again: 1 }]
      if (this.chats.length) {
        rows.push({ n: 'Chats' })
        kinds.push(HEADING)
        targets.push(null)
        for (const c of this.chats) {
          const r = chatRow(c, false)
          rows.push(r.row)
          kinds.push(r.kind)
          targets.push({ chat: c })
        }
      }
      if (this.found.length) {
        rows.push({ n: 'Messages' })
        kinds.push(HEADING)
        targets.push(null)
        for (const f of this.found) {
          const who = f.o ? 'You: ' : f.g && f.s ? f.s.split(' ')[0] + ': ' : ''
          rows.push({ n: f.n, t: f.d, v: who + f.x.replace(/\s+/g, ' ') })
          kinds.push(FOUND)
          targets.push({ found: f })
        }
      }
      if (!this.done) {
        rows.push({ n: 'Some messages may be missing' })
        kinds.push(HEADING)
        targets.push(null)
      }
      this.targets = targets
      return listData(rows, kinds)
    },
  }),
)
