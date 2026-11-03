// The chat list: the latest 20 chats, then more on request. It shows the
// list kept from last time at once, asks the computer for the current one,
// and follows changes while it's open.
//
// The rows are a SCROLL_LIST, the system's own list: it draws only the rows
// on screen, and a change hands it new data instead of making every row's
// widgets again (seven each, which made the watch stutter whenever a
// message came). A Search row comes first. Profile pictures load one at a
// time after the list shows (utils/avatars.js).

import { BasePage } from '@zeppos/zml/base-page'
import { push } from '@zos/router'
import { localStorage } from '@zos/storage'
import { align, prop, widget } from '@zos/ui'
import { px } from '@zos/utils'
import { upsertChat } from '../../shared/convert'
import { ask, failed, reason } from '../../utils/ask'
import { Loader } from '../../utils/avatars'
import { BUTTON_ROW, chatRow, chatRows, listData } from '../../utils/chatrows'
import { poll } from '../../utils/poll'
import { C, Canvas, H, L, W, errorView } from '../../utils/ui'

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
      this.list = null
      this.shown = '' // which layout the canvas holds, see layout()
      this.timers = {}
      this.gone = false
      // A picture arriving redraws the list, a few at once.
      this.avatars = new Loader(this, () => this.later('avatars', 400, () => this.render()))
    },

    build() {
      this.render()
      this.avatars.want(this.chats.map((c) => c.i)) // the list kept from last time
      this.loadPrefs()
      this.refresh()
    },

    onDestroy() {
      this.gone = true
      this.avatars.stop()
      if (this.stop) this.stop()
      for (const k in this.timers) clearTimeout(this.timers[k])
      if (this.timers.save) save('chats', this.chats.slice(0, 20))
    },

    // later runs f in ms, once: asking again replaces the earlier one.
    later(name, ms, f) {
      if (this.timers[name]) clearTimeout(this.timers[name])
      this.timers[name] = setTimeout(() => {
        delete this.timers[name]
        if (!this.gone) f()
      }, ms)
    },

    // loadPrefs reads the settings made in the Zepp app; the reply page
    // reads them from storage too.
    loadPrefs() {
      ask(this, 'prefs')
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
      ask(this, 'chats').then(
        (d) => {
          if (this.gone) return
          if (d.err) {
            this.fail(d.err, d.msg)
            return
          }
          try {
            this.err = null
            this.loading = false
            this.chats = d.c
            this.more = !!d.more
            save('chats', this.chats)
            this.render()
            this.avatars.want(this.chats.map((c) => c.i))
            if (this.stop) this.stop()
            this.stop = poll(this, d.k, (evs) => this.apply(evs), () => this.refresh())
          } catch (e) {
            this.fail('bug', failed('chats', e))
          }
        },
        (e) => this.fail('phone', reason(e)),
      )
    },

    fail(code, msg) {
      if (this.gone) return
      this.loading = false
      this.err = { code, msg }
      this.render()
      // The phone or the computer coming back is the usual end of it:
      // look again without waiting for a tap.
      if (code === 'phone' || code === 'offline' || code === 'whatsapp') {
        this.later('retry', 15000, () => this.refresh())
      }
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
      ask(this, 'chats', { after: last.i })
        .then((d) => {
          if (d.err) return
          const have = new Set(this.chats.map((c) => c.i))
          const added = d.c.filter((c) => !have.has(c.i))
          this.chats = this.chats.concat(added)
          this.more = !!d.more
          this.render()
          this.avatars.want(added.map((c) => c.i))
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
        this.render()
        this.avatars.want(this.chats.slice(0, 20).map((c) => c.i))
        // Storage is flash: write it once things calm down.
        this.later('save', 5000, () => save('chats', this.chats.slice(0, 20)))
      }
    },

    search() {
      push({ url: 'page/search/index.page' })
    },

    open(c) {
      if (c.u) {
        c.u = 0 // opening it reads it
        this.render()
      }
      push({ url: 'page/chat/index.page', params: JSON.stringify({ i: c.i, n: c.n, g: c.g ? 1 : 0, r: c.r ? 1 : 0 }) })
    },

    // layout is what the page shows: a message, or the list (under an
    // error bar when the list is an old one).
    layout() {
      if (this.loading) return 'loading'
      if (this.err && !this.chats.length) return 'error'
      if (!this.chats.length) return 'empty'
      return this.err ? 'list-error ' + this.err.code : 'list'
    },

    render() {
      const shown = this.layout()
      if (shown === this.shown && this.list) {
        this.list.setProperty(prop.UPDATE_DATA, Object.assign(this.data(), { on_page: 1 }))
        return
      }
      const cv = this.cv
      cv.clear()
      this.list = null
      this.shown = shown
      cv.title('Chats')
      const x = L.side
      const w = W - 2 * L.side
      if (shown === 'loading') {
        cv.text({ x: 0, y: Math.floor(H / 2) - px(20), w: W, h: px(40), text: 'Loading…', size: px(22), color: C.sub, align: align.CENTER_H })
        return
      }
      if (shown === 'error') {
        const v = errorView(this.err.code, this.err.msg)
        cv.message({ title: v.title, titleColor: C.warn, body: v.body, action: 'Try again', click: () => this.retry() })
        return
      }
      if (shown === 'empty') {
        cv.text({ x, y: L.top + px(40), w, h: px(40), text: 'No chats yet', size: px(20), color: C.sub, align: align.CENTER_H })
        return
      }
      let y = L.top
      if (this.err) {
        // The list kept from last time, under a bar that says why it's old.
        cv.button({
          x, y, w, h: px(48), radius: px(14),
          text: errorView(this.err.code, this.err.msg).short,
          size: px(15), color: 0x3a2e14, down: 0x4a3b1a, textColor: C.warn,
          click: () => this.retry(),
        })
        y += px(56)
      }
      const config = chatRows(w)
      this.list = cv.add(widget.SCROLL_LIST, Object.assign({
        x, y, w, h: H - y,
        item_space: px(4),
        item_config: config,
        item_config_count: config.length,
        item_click_func: (_, i) => {
          if (i === 0) this.search()
          else if (i <= this.chats.length) this.open(this.chats[i - 1])
          else this.loadMore()
        },
      }, this.data()))
    },

    // data is the list's rows: Search, the chats, and Load more.
    data() {
      const rows = [{ n: 'Search chats and messages' }]
      const kinds = [BUTTON_ROW]
      for (const c of this.chats) {
        const r = chatRow(c, this.hide)
        rows.push(r.row)
        kinds.push(r.kind)
      }
      if (this.more) {
        rows.push({ n: 'Load more' })
        kinds.push(BUTTON_ROW)
      }
      return listData(rows, kinds)
    },
  }),
)
