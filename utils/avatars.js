// Profile pictures, loaded one at a time as pages show chats and kept on
// the watch. Each chat's entry in storage ("avatars2") is { p: the
// picture's path ('' for none), v: its version, t: when it was last
// checked }. A picture is checked again after a few days, a chat without
// one after a day; until a chat's picture comes, its initial shows.
//
// One queue serves every page, the chats a page shows first at its front:
// the top of the chat list (pinned, then the latest) and what search
// found. A picture is asked for only once the last one reached the watch.
// The computer fetches pictures it doesn't have yet one at a time, so it
// may answer "pending": that chat waits a while and is asked again.
//
// The entries, the queue and the pages watching them are in the app's
// globalData (see files.js's shared): every page bundle has its own copy
// of this module.

import { localStorage } from '@zos/storage'
import { ask } from './ask'
import { onFile, remove, shared } from './files'

const SIZE = 58 // the chat list's avatar, in pixels
const FRESH = 3 * 86400000
const FRESH_NONE = 86400000
const KEEP = 200 // chats remembered at most
const ARRIVE = 30000 // how long a picture on its way may take
const TRIES = 6 // pending answers before a chat is left for next time

// state is the avatars' shared state.
function state() {
  const g = shared()
  if (!g.avatars) {
    let cache = {}
    try {
      cache = JSON.parse(localStorage.getItem('avatars2', '') || '{}') || {}
      // The first version took "not fetched yet" for "none" and kept it.
      localStorage.removeItem('avatars')
    } catch (e) {}
    g.avatars = {
      cache,
      watchers: new Set(), // called when a picture changes
      pages: [], // the pages that asked, the latest last: requests go through it
      queue: [], // chat IDs, first first
      later: {}, // chat ID: when it may be asked again
      tries: {}, // chat ID: pending answers so far
      busy: false,
      arriving: null, // { id, done } while a picture is on its way
      saveTimer: null,
      nextTimer: null,
    }
    // Pictures are kept whichever page is open when they come.
    onFile((e) => {
      if (e.params.kind !== 'av' || e.state === 'progress') return
      const st = state()
      const id = e.params.chat
      if (e.state === 'done') {
        const old = st.cache[id]
        if (old && old.p && old.p !== e.file.filePath) remove(old.p)
        st.cache[id] = { p: e.file.filePath, v: e.params.v, t: Date.now() }
        save()
        for (const f of Array.from(st.watchers)) f()
      }
      if (st.arriving && st.arriving.id === id) st.arriving.done(e.state === 'done')
    })
  }
  return g.avatars
}

// save writes the entries to storage a while later, many changes at once:
// writing flash stalls the screen. A page leaving writes them at once
// (Loader's stop).
function save() {
  const st = state()
  if (st.saveTimer) return
  st.saveTimer = setTimeout(write, 20000)
}

function write() {
  const st = state()
  if (st.saveTimer) clearTimeout(st.saveTimer)
  st.saveTimer = null
  const cache = st.cache
  const ids = Object.keys(cache)
  if (ids.length > KEEP) {
    // Forget the ones checked longest ago.
    ids.sort((a, b) => cache[a].t - cache[b].t)
    for (const id of ids.slice(0, ids.length - KEEP)) {
      remove(cache[id].p)
      delete cache[id]
    }
  }
  localStorage.setItem('avatars2', JSON.stringify(cache))
}

// moreComing says whether pictures are still to be asked for now, so a
// page can show the ones that came together with the next.
export function moreComing() {
  const st = state()
  const now = Date.now()
  return st.queue.some((id) => !(st.later[id] > now))
}

// avatarPath is the picture to show for a chat, or '' for its initial.
export function avatarPath(id) {
  const a = state().cache[id]
  return (a && a.p) || ''
}

function stale(a, now) {
  if (!a) return true
  return now - a.t > (a.p ? FRESH : FRESH_NONE)
}

// page is the live page that asked last, for requests to go through.
function page() {
  const pages = state().pages
  for (let i = pages.length - 1; i >= 0; i--) {
    if (!pages[i].gone) return pages[i]
  }
  return null
}

// soon runs next after ms.
function soon(ms) {
  const st = state()
  if (st.nextTimer) clearTimeout(st.nextTimer)
  st.nextTimer = setTimeout(() => {
    st.nextTimer = null
    next()
  }, ms)
}

// wait puts a chat back at the end of the queue, not to be asked for ms.
function wait(id, ms) {
  const st = state()
  st.later[id] = Date.now() + ms
  if (st.queue.indexOf(id) < 0) st.queue.push(id)
}

function next() {
  const st = state()
  const pg = page()
  if (st.busy || !pg) return
  const now = Date.now()
  const i = st.queue.findIndex((id) => !(st.later[id] > now))
  if (i < 0) {
    // Everything left waits: look again when the first may be asked.
    const at = Math.min(...st.queue.map((id) => st.later[id]))
    if (st.queue.length) soon(Math.max(1000, at - now))
    return
  }
  const id = st.queue.splice(i, 1)[0]
  delete st.later[id]
  st.busy = true
  const have = (st.cache[id] || {}).v || ''
  const finish = () => {
    st.busy = false
    soon(150)
  }
  ask(pg, 'avatar', { chat: id, size: SIZE, have }, { timeout: 45000 }).then(
    (d) => {
      if (d.err) {
        wait(id, 60000)
        finish()
        return
      }
      if (d.pending) {
        // The computer is fetching it: ask again later, a little later each time.
        const n = (st.tries[id] = (st.tries[id] || 0) + 1)
        if (n < TRIES) wait(id, Math.min(15000 * Math.pow(2, n - 1), 300000))
        finish()
        return
      }
      delete st.tries[id]
      if (d.none) {
        const old = st.cache[id]
        st.cache[id] = { p: '', v: '', t: Date.now() }
        if (old && old.p) {
          remove(old.p)
          for (const f of Array.from(st.watchers)) f()
        }
        save()
        finish()
        return
      }
      if (d.same && st.cache[id]) {
        st.cache[id].t = Date.now()
        save()
        finish()
        return
      }
      // sent: wait for it to reach the watch before asking for the next.
      let timer = null
      st.arriving = {
        id,
        done: (ok) => {
          if (!st.arriving || st.arriving.id !== id) return
          clearTimeout(timer)
          st.arriving = null
          if (!ok) wait(id, 60000)
          finish()
        },
      }
      timer = setTimeout(() => st.arriving && st.arriving.done(false), ARRIVE)
    },
    () => {
      wait(id, 60000)
      finish()
    },
  )
}

// Loader is a page's way to the queue: it asks for the pictures of the
// chats it shows and calls changed when one arrives.
export class Loader {
  constructor(pg, changed) {
    this.page = pg
    this.changed = changed
    const st = state()
    st.watchers.add(changed)
    st.pages.push(pg)
  }

  stop() {
    const st = state()
    st.watchers.delete(this.changed)
    st.pages = st.pages.filter((p) => p !== this.page)
    // The page's timers may go with it.
    if (st.saveTimer) write()
  }

  // want puts the chats (IDs, the first most wanted) whose pictures are
  // missing or old at the front of the queue, before the ones other pages
  // and earlier calls asked for.
  want(ids) {
    const st = state()
    const now = Date.now()
    const front = ids.filter((id, i) => ids.indexOf(id) === i && stale(st.cache[id], now) && !(st.arriving && st.arriving.id === id))
    if (!front.length) return
    st.queue = front.concat(st.queue.filter((id) => front.indexOf(id) < 0))
    next()
  }
}
