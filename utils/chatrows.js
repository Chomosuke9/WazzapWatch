// The rows of the chat list's SCROLL_LIST, which search's results use too:
// their kinds (item_config) and the data of a chat's row.
//
// The list's text views center their text unless align_h says otherwise.

import { align } from '@zos/ui'
import { px } from '@zos/utils'
import { avatarPath } from './avatars'
import { C, avatarIndex, initial } from './ui'

export const ROW = px(86)
const AV = 58 // the avatar pictures' size, in pixels (assets/*/av and the profile pictures)
const BADGE = px(40)
const BUTTON = px(56)

// The rows' kinds, item_config's type_id.
export const READ = 1
export const UNREAD = 2
export const UNREAD_MUTED = 3
export const BUTTON_ROW = 4 // "Load more", "Search…": a pill with a label
export const HEADING = 5 // "Chats", "Messages"
export const FOUND = 6 // a message search found

// chatRows is the item_config of the list's rows, w wide.
export function chatRows(w) {
  const ay = Math.floor((ROW - AV) / 2)
  const tx = AV + px(12)
  const timeW = px(80)
  const nameW = w - tx - timeW - px(6)
  const avatar = { x: 0, y: ay, w: AV, h: AV, key: 'a' }
  // The initial over a chat without a picture. Its box is narrow so the
  // letter sits about right even if align_h were ignored.
  const letter = { x: Math.floor(AV / 2) - px(14), y: ay, w: px(28), h: AV, key: 'l', color: 0xffffff, text_size: px(25), align_h: align.CENTER_H, align_v: align.CENTER_V }
  const name = { x: tx, y: px(8), w: nameW, h: px(36), key: 'n', color: C.text, text_size: px(23), align_h: align.LEFT, align_v: align.CENTER_V }
  const time = (color) => ({ x: w - timeW, y: px(12), w: timeW, h: px(28), key: 't', color, text_size: px(16), align_h: align.RIGHT, align_v: align.CENTER_V })
  const preview = (pw) => ({ x: tx, y: px(46), w: pw, h: px(32), key: 'v', color: C.sub, text_size: px(19), align_h: align.LEFT, align_v: align.CENTER_V })
  const badge = (bg, color) => ({ x: w - BADGE, y: px(47), w: BADGE, h: px(30), key: 'b', color, text_size: px(16), bg_color: bg, bg_radius: px(15), align_h: align.CENTER_H, align_v: align.CENTER_V })
  const row = (type_id, texts) => ({
    type_id,
    item_height: ROW,
    item_bg_color: C.bg,
    item_bg_radius: px(16),
    item_press_effect: true,
    image_view: [avatar],
    image_view_count: 1,
    text_view: texts,
    text_view_count: texts.length,
  })
  const pw = w - tx - BADGE - px(8)
  const foundTexts = [
    { x: px(4), y: px(6), w: w - timeW - px(10), h: px(30), key: 'n', color: C.accent, text_size: px(18), align_h: align.LEFT, align_v: align.CENTER_V },
    { x: w - timeW - px(40), y: px(8), w: timeW + px(36), h: px(28), key: 't', color: C.dim, text_size: px(15), align_h: align.RIGHT, align_v: align.CENTER_V },
    { x: px(4), y: px(38), w: w - px(8), h: px(40), key: 'v', color: C.text, text_size: px(20), align_h: align.LEFT, align_v: align.CENTER_V },
  ]
  return [
    row(READ, [letter, name, time(C.dim), preview(w - tx)]),
    row(UNREAD, [letter, name, time(C.accent), preview(pw), badge(C.accent, C.onAccent)]),
    row(UNREAD_MUTED, [letter, name, time(C.dim), preview(pw), badge(C.muted, 0xffffff)]),
    {
      type_id: BUTTON_ROW,
      item_height: BUTTON,
      item_bg_color: C.card,
      item_bg_radius: Math.floor(BUTTON / 2),
      item_press_effect: true,
      text_view: [{ x: px(24), y: 0, w: w - px(48), h: BUTTON, key: 'n', color: C.sub, text_size: px(19), align_h: align.LEFT, align_v: align.CENTER_V }],
      text_view_count: 1,
    },
    {
      type_id: HEADING,
      item_height: px(44),
      item_bg_color: C.bg,
      item_bg_radius: 0,
      text_view: [{ x: px(4), y: px(8), w: w - px(8), h: px(32), key: 'n', color: C.accent, text_size: px(17), align_h: align.LEFT, align_v: align.CENTER_V }],
      text_view_count: 1,
    },
    {
      type_id: FOUND,
      item_height: ROW,
      item_bg_color: C.card,
      item_bg_radius: px(16),
      item_press_effect: true,
      text_view: foundTexts,
      text_view_count: foundTexts.length,
    },
  ]
}

// chatRow is a chat's row and its kind. hide leaves its preview out.
export function chatRow(c, hide) {
  const pic = avatarPath(c.i)
  return {
    row: {
      a: pic || 'av/' + avatarIndex(c.i) + '.png',
      l: pic ? '' : initial(c.n),
      n: c.n,
      t: c.t,
      v: hide ? '' : c.v || '',
      b: c.u ? (c.u > 99 ? '99+' : String(c.u)) : '',
    },
    kind: !c.u ? READ : c.m ? UNREAD_MUTED : UNREAD,
  }
}

// listData is UPDATE_DATA's (and SCROLL_LIST's) data: rows, and a kind for
// each run of rows of the same kind.
export function listData(rows, kinds) {
  const types = []
  for (let i = 0; i < kinds.length; i++) {
    const t = types[types.length - 1]
    if (t && t.type_id === kinds[i]) t.end = i
    else types.push({ start: i, end: i, type_id: kinds[i] })
  }
  return {
    data_array: rows,
    data_count: rows.length,
    data_type_config: types,
    data_type_config_count: types.length,
  }
}
