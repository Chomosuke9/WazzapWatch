// Turns the JSON of WazzapClients' API (internal/remote) into the short
// objects the side service sends the watch over Bluetooth: one-letter keys,
// and labels and times already worded, so the watch only draws them.
// Plain JavaScript without Zepp OS modules, so Node can test it.

// Chat (keys of a chat the watch lists):
//   i id, n name, g group, m muted, f pinned, r read-only (a group you
//   left), a archived (it leaves the list), u unread, v preview, t time
//   label, s time (Unix seconds, for sorting)
// Message:
//   i id, o mine, s sender (groups), x text, c cut (GET it whole), q quote,
//   t time label, k status (your messages: ! failed, p pending, s sent,
//   d delivered, r read), e edited, p picture to view (i photo, s sticker,
//   v a video's or GIF's preview), r reactions ([emoji, count], the most
//   given first), y your reaction, z it can't take a reaction or a reply
//   (deleted, a system message)
// Found (a message search found): a Message, plus h its chat's ID, n the
//   chat's name, g a group, and d its day and time
// Event:
//   t type: m message (c chat, m message, n new), c chat (c chat), r receipt
//   (c chat, i ids, k status), d deleted (c chat, i ids), s connection (s
//   state), x reload everything

export const MEDIA = {
  image: 'Photo',
  video: 'Video',
  gif: 'GIF',
  voice: 'Voice message',
  audio: 'Audio',
  document: 'Document',
  sticker: 'Sticker',
  location: 'Location',
  contact: 'Contact',
  poll: 'Poll',
  event: 'Event',
}

const KINDS = {
  deleted: 'This message was deleted',
  viewonce: 'View once',
  waiting: 'Waiting for this message',
  unsupported: "This message couldn't load",
}

const STATUS = { failed: '!', pending: 'p', sent: 's', delivered: 'd', read: 'r' }

// PICTURES are the media the watch can show a picture of.
const PICTURES = { image: 'i', sticker: 's', video: 'v', gif: 'v' }

// previewLimit is how much of a chat's last message the list shows.
const previewLimit = 60

function clip(s, n) {
  const chars = Array.from(s)
  return chars.length <= n ? s : chars.slice(0, n).join('').trimEnd() + '…'
}

function duration(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m + ':' + (s < 10 ? '0' : '') + s
}

// mediaLabel is what stands for a message's media: "Photo", "Voice message 0:12".
export function mediaLabel(m) {
  const label = MEDIA[m.media]
  if (!label) return ''
  return (m.media === 'voice' || m.media === 'audio') && m.duration ? label + ' ' + duration(m.duration) : label
}

// messageText is what a message shows: its text, after a label in brackets
// for its media, or what its kind says.
export function messageText(m) {
  if (KINDS[m.kind]) return KINDS[m.kind]
  const text = m.text || ''
  const label = mediaLabel(m)
  if (!label) return text
  if (!text || m.media === 'voice' || m.media === 'audio') return label
  return '[' + label + '] ' + text
}

// firstName is how a group's preview names a sender: their first name,
// or all of a "~push name" or a phone number.
export function firstName(name) {
  if (!name || name[0] === '~' || name[0] === '+') return name || ''
  const i = name.indexOf(' ')
  return i > 0 ? name.slice(0, i) : name
}

function pad(n) {
  return (n < 10 ? '0' : '') + n
}

// timeLabel is a chat's time in the list: the time today, "Yesterday", the
// day this week, or the date.
export function timeLabel(unix, now = new Date()) {
  const d = new Date(unix * 1000)
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day(now) - day(d)) / 86400000)
  if (days <= 0) return pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (days === 1) return 'Yesterday'
  if (days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2)
}

// clockLabel is a message's time: hours and minutes.
export function clockLabel(unix) {
  const d = new Date(unix * 1000)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// preview is the line under a chat's name.
export function preview(c) {
  const m = c.last
  if (!m) return ''
  let prefix = ''
  if (m.kind !== 'system') {
    if (m.mine) prefix = 'You: '
    else if (c.group && m.sender) prefix = firstName(m.sender) + ': '
  }
  return clip(prefix + messageText(m).replace(/\s+/g, ' '), previewLimit)
}

export function compactChat(c, now) {
  const o = { i: c.id, n: c.name || c.id, v: preview(c), t: timeLabel(c.time, now), s: c.time }
  if (c.group) o.g = 1
  if (c.muted) o.m = 1
  if (c.pinned) o.f = 1
  if (c.readOnly) o.r = 1
  if (c.archived) o.a = 1
  if (c.unread) o.u = c.unread
  return o
}

export function compactMessage(m) {
  const o = { i: m.id, x: messageText(m), t: clockLabel(m.time) }
  if (m.mine) {
    o.o = 1
    o.k = STATUS[m.status] || 'p'
  } else if (m.sender) {
    o.s = m.sender
  }
  if (m.truncated) o.c = 1
  if (m.edited) o.e = 1
  if (PICTURES[m.media] && !KINDS[m.kind]) o.p = PICTURES[m.media]
  if (m.reactions && m.reactions.length) o.r = m.reactions.slice(0, 4).map((r) => [r.emoji, r.count])
  if (m.myReaction) o.y = m.myReaction
  if (m.kind === 'deleted' || m.kind === 'system' || m.kind === 'waiting') o.z = 1
  if (m.quote) {
    const who = m.quote.sender && m.quote.sender !== 'You' ? firstName(m.quote.sender) : 'You'
    const what = m.quote.text || MEDIA[m.quote.media] || ''
    o.q = clip(who + ': ' + what.replace(/\s+/g, ' '), 50)
  }
  return o
}

// compactFound converts a message that search found, with its chat.
export function compactFound(f, now) {
  const o = compactMessage(f.message)
  o.h = f.chat.id
  o.n = f.chat.name || f.chat.id
  if (f.chat.group) o.g = 1
  const day = timeLabel(f.message.time, now)
  o.d = day === o.t ? day : day + ' ' + o.t
  return o
}

// compactEvent converts an event, or returns null for one the watch
// doesn't use.
export function compactEvent(e, now) {
  switch (e.type) {
    case 'message':
      return e.message ? { t: 'm', c: e.chat, m: compactMessage(e.message), n: e.new ? 1 : 0 } : null
    case 'chat':
      return e.chats && e.chats[0] ? { t: 'c', c: compactChat(e.chats[0], now) } : null
    case 'receipt':
      return { t: 'r', c: e.chat, i: e.ids || [], k: STATUS[e.status] || 'p' }
    case 'deleted':
      return { t: 'd', c: e.chat, i: e.ids || [] }
    case 'conn':
      return { t: 's', s: e.state }
    case 'reset':
      return { t: 'x' }
  }
  return null
}

// sortChats orders chats like the app: pinned ones first, then the latest.
// (Pinned chats keep the server's order among themselves.)
export function sortChats(chats) {
  const pinned = chats.filter((c) => c.f)
  const rest = chats.filter((c) => !c.f).sort((a, b) => b.s - a.s)
  return pinned.concat(rest)
}

// upsertChat applies a chat event to a list: the chat replaces its old
// self, comes in, or leaves when it was archived.
export function upsertChat(chats, c) {
  const i = chats.findIndex((x) => x.i === c.i)
  const out = chats.slice()
  if (i >= 0) {
    if (c.f && out[i].f) {
      out[i] = c // a pinned chat keeps its place
      return c.a ? out.filter((x) => x.i !== c.i) : out
    }
    out.splice(i, 1)
  }
  if (c.a) return out
  return sortChats(out.concat([c]))
}

// DEFAULT_QUICK are the quick replies until the user sets their own.
export const DEFAULT_QUICK = ['OK', "I'll get back to you", 'On my way', 'Thanks!']

// quickReplies reads the settings' quick replies, one a line.
export function quickReplies(text) {
  if (text == null || text === '') return DEFAULT_QUICK
  return String(text)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
}

// serverURL tidies what the user typed: a scheme, and no trailing slash.
export function serverURL(s) {
  s = String(s || '').trim().replace(/\/+$/, '')
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  return s
}
