// Drawing helpers shared by the pages: the screen's shape and margins, the
// colors, and a Canvas that remembers the widgets it made so a page can
// draw itself again from its state.

import {
  align,
  createWidget,
  deleteWidget,
  getTextLayout,
  text_style,
  updateStatusBarTitle,
  widget,
} from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'
import { px } from '@zos/utils'

const info = getDeviceInfo()

export const W = info.width
export const H = info.height
// SQUARE screens (Bip Max) have the system's status bar on top, 64 px tall,
// with the app's title and the time; round ones are all ours.
export const SQUARE = info.screenShape === SCREEN_SHAPE_SQUARE

export const L = SQUARE
  ? { top: px(72), side: px(18), bottom: px(28), status: px(64) }
  : { top: px(92), side: px(44), bottom: px(80), status: 0 }

export const C = {
  bg: 0x000000,
  text: 0xf1f3f4,
  sub: 0xa3a9ad,
  dim: 0x8e959a,
  line: 0x1b1f21,
  accent: 0x25c76f,
  accentDown: 0x1a9653,
  onAccent: 0x000000,
  card: 0x1d2225,
  cardDown: 0x2b3236,
  mine: 0x0f5132,
  mineMeta: 0xb5c9c1,
  read: 0x53bdeb,
  muted: 0x5f666b,
  warn: 0xf2b45a,
}

// avatarColor gives a chat a color of its own from its ID, for names in a
// group. The chat list's avatars are pictures, assets/*/av/<avatarIndex>.png,
// of the same hues made deep enough for a white initial.
const AVATARS = [0xf2b45a, 0x7fa7f5, 0xc58af0, 0x5cc8d6, 0xe88b8b, 0x9ad07a, 0xff9f7a, 0xf5a3c7]
export function avatarIndex(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % AVATARS.length
}

export function avatarColor(id) {
  return AVATARS[avatarIndex(id)]
}

export function initial(name) {
  const ch = Array.from((name || '?').replace(/^[~+\s]+/, ''))[0] || '?'
  return ch.toUpperCase()
}

// Canvas makes widgets and deletes them all at once, or the ones made
// since a mark, so a page can draw again only what changed.
export class Canvas {
  constructor() {
    this.widgets = []
  }

  add(type, opts) {
    const w = createWidget(type, opts)
    this.widgets.push(w)
    return w
  }

  clear() {
    this.truncate(0)
  }

  // mark is where the next widget goes, for truncate.
  mark() {
    return this.widgets.length
  }

  // truncate deletes the widgets made since mark n, the newest first.
  truncate(n) {
    for (let i = this.widgets.length - 1; i >= n; i--) deleteWidget(this.widgets[i])
    this.widgets.length = Math.min(n, this.widgets.length)
  }

  text(o) {
    return this.add(widget.TEXT, {
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      text: o.text,
      text_size: o.size,
      color: o.color == null ? C.text : o.color,
      align_h: o.align || align.LEFT,
      align_v: o.valign || align.CENTER_V,
      text_style: o.wrap ? text_style.WRAP : text_style.ELLIPSIS,
    })
  }

  rect(x, y, w, h, color, radius = 0) {
    return this.add(widget.FILL_RECT, { x, y, w, h, color, radius })
  }

  circle(cx, cy, r, color) {
    return this.add(widget.CIRCLE, { center_x: cx, center_y: cy, radius: r, color })
  }

  // button is a rounded button; o.color is its fill, o.textColor its label's.
  button(o) {
    return this.add(widget.BUTTON, {
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      radius: o.radius == null ? Math.floor(o.h / 2) : o.radius,
      text: o.text || '',
      text_size: o.size || px(21),
      color: o.textColor == null ? C.text : o.textColor,
      normal_color: o.color == null ? C.card : o.color,
      press_color: o.down == null ? C.cardDown : o.down,
      click_func: o.click,
    })
  }

  // title is the page's title: in the status bar of a square screen, or
  // drawn at the top of a round one.
  title(t) {
    if (SQUARE) {
      updateStatusBarTitle(t)
      return
    }
    this.text({ x: px(90), y: px(30), w: W - px(180), h: px(44), text: t, size: px(24), align: align.CENTER_H })
  }

  // message draws a page with only something to say, and a button.
  message(o) {
    const w = W - 2 * L.side
    let y = Math.max(L.top, Math.floor(H / 2) - px(130))
    if (o.title) {
      this.text({ x: L.side, y, w, h: px(40), text: o.title, size: px(26), align: align.CENTER_H, color: o.titleColor })
      y += px(48)
    }
    const body = measure(o.body, px(19), w)
    this.text({ x: L.side, y, w, h: body + px(4), text: o.body, size: px(19), color: C.sub, align: align.CENTER_H, wrap: true })
    y += body + px(24)
    if (o.action) {
      const bw = px(200)
      this.button({ x: Math.floor((W - bw) / 2), y, w: bw, h: px(56), text: o.action, color: C.accent, down: C.accentDown, textColor: C.onAccent, click: o.click })
    }
  }
}

// Text layouts are slow to work out and a chat asks for the same ones
// (times, ticks, the same messages) on every draw, so they're kept.
const layouts = new Map()

function layout(text, size, w, wrapped) {
  const k = size + ' ' + w + ' ' + wrapped + ' ' + text
  let l = layouts.get(k)
  if (!l) {
    if (layouts.size >= 500) layouts.clear()
    const r = getTextLayout(text, { text_size: size, text_width: w, wrapped })
    l = { w: Math.ceil(r.width), h: Math.ceil(r.height) }
    layouts.set(k, l)
  }
  return l
}

// measure is how tall text is when it wraps at width w.
export function measure(text, size, w) {
  if (!text) return 0
  return layout(text, size, w, 1).h
}

// textWidth is how wide text is on one line.
export function textWidth(text, size) {
  if (!text) return 0
  return layout(text, size, W * 4, 0).w
}

// ERRORS words the side service's errors (app-side/index.js).
export const ERRORS = {
  setup: { title: 'Not set up', body: 'Open Wazzap in the Zepp app, then enter the server address and token from WazzapClients.' },
  offline: { title: "Can't reach computer", body: 'Run WazzapClients on your computer, turn on Smartwatch access in Extra features, and connect your phone to Tailscale.' },
  token: { title: 'Wrong token', body: 'Copy the token from WazzapClients into the Wazzap settings in the Zepp app.' },
  whatsapp: { title: 'WhatsApp offline', body: "WazzapClients on your computer isn't connected to WhatsApp." },
  phone: { title: "Can't reach phone", body: 'Make sure the watch is connected to your phone and the Zepp app is running.' },
  server: { title: 'Something went wrong', body: 'The server turned the request down.' },
  bug: { title: 'Watch app error', body: 'Something went wrong in this app.' },
}

// errorView words an error. msg is the server's message, or why the phone
// couldn't be reached, or the page's own error.
export function errorView(code, msg) {
  const e = ERRORS[code] || ERRORS.server
  if (!msg) return { title: e.title, body: e.body, short: e.title }
  if (code === 'server') return { title: e.title, body: msg, short: e.title }
  return { title: e.title, body: e.body + ' (' + msg + ')', short: e.title + ': ' + msg }
}
