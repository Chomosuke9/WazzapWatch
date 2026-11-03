// The messages of the chats opened lately, kept in memory while the app
// runs, so a chat opens at once (going back to it after replying makes
// the page again) and then catches up. Nothing goes to storage.
//
// It lives in the app's globalData (see files.js's shared): every page
// bundle has its own copy of this module.

import { shared } from './files'

const KEEP = 6 // chats kept, the ones opened longest ago go first

function chats() {
  const g = shared()
  if (!g.msgCache) g.msgCache = [] // { id, msgs, more }, the latest first
  return g.msgCache
}

// cached returns a copy of a chat's kept messages, or null.
export function cached(id) {
  const c = chats().find((x) => x.id === id)
  return c ? { msgs: c.msgs.slice(), more: c.more } : null
}

// keep remembers a chat's messages as the page shows them.
export function keep(id, msgs, more) {
  const list = chats().filter((x) => x.id !== id)
  list.unshift({ id, msgs: msgs.slice(), more })
  shared().msgCache = list.slice(0, KEEP)
}

// added puts a message (one you just sent) into a kept chat, so it shows
// when the chat opens again before its event comes.
export function added(id, m) {
  const c = chats().find((x) => x.id === id)
  if (!c || !m) return
  const i = c.msgs.findIndex((x) => x.i === m.i)
  if (i >= 0) c.msgs[i] = m
  else c.msgs.push(m)
}
