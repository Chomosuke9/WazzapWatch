// The side service runs in the Zepp app on the phone. It asks WazzapClients'
// API (Settings > Extra features > Smartwatch access on the computer) for
// what the watch requests, and answers with the short objects of
// shared/convert.js, since Bluetooth is slow.
//
// Every answer is { ok: 1, ... } or { err, msg }: err is "setup" (no
// address or token yet), "offline" (the computer can't be reached),
// "token" (wrong token), "whatsapp" (WhatsApp isn't connected there) or
// "server" (anything else, msg says what).

import { BaseSideService } from '@zeppos/zml/base-side'
import {
  compactChat,
  compactEvent,
  compactMessage,
  quickReplies,
  serverURL,
} from '../shared/convert'

const storage = () => settings.settingsStorage

function fail(err, msg) {
  const e = new Error(msg || err)
  e.code = err
  return e
}

function parse(body) {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch (e) {
    return null
  }
}

const enc = encodeURIComponent

AppSideService(
  BaseSideService({
    // api calls the computer. timeout is in milliseconds.
    api(path, { method = 'GET', body, timeout = 12000 } = {}) {
      const server = serverURL(storage().getItem('server'))
      const token = (storage().getItem('token') || '').trim()
      if (!server || !token) return Promise.reject(fail('setup'))
      const headers = { Authorization: 'Bearer ' + token }
      const req = { url: server + '/v1' + path, method, headers, timeout }
      if (body) {
        headers['Content-Type'] = 'application/json'
        req.body = JSON.stringify(body)
      }
      return this.fetch(req).then(
        (res) => {
          const data = parse(res.body) || {}
          if (res.status === 401) throw fail('token')
          if (res.status === 503) throw fail('whatsapp', data.error)
          if (res.status >= 400) throw fail('server', data.error || 'HTTP ' + res.status)
          return data
        },
        () => {
          throw fail('offline')
        },
      )
    },

    handlers: {
      ping() {
        return this.api('/ping').then((d) => ({ state: d.state, me: d.me, k: d.cursor }))
      },
      chats({ after }) {
        const now = new Date()
        return this.api('/chats?limit=20' + (after ? '&after=' + enc(after) : '')).then((d) => ({
          c: d.chats.map((c) => compactChat(c, now)),
          more: d.more ? 1 : 0,
          k: d.cursor,
        }))
      },
      msgs({ chat, before }) {
        const q = before ? '&before=' + enc(before) : ''
        return this.api('/chats/' + enc(chat) + '/messages?limit=15' + q).then((d) => ({
          m: d.messages.map(compactMessage),
          more: d.more ? 1 : 0,
        }))
      },
      msg({ chat, id }) {
        return this.api('/chats/' + enc(chat) + '/messages/' + enc(id)).then((d) => ({ m: compactMessage(d.message) }))
      },
      send({ chat, text, replyTo, nonce }) {
        return this.api('/chats/' + enc(chat) + '/messages', {
          method: 'POST',
          body: { text, replyTo, nonce },
        }).then((d) => ({ m: compactMessage(d.message) }))
      },
      read({ chat }) {
        return this.api('/chats/' + enc(chat) + '/read', { method: 'POST' }).then(() => ({}))
      },
      // events waits up to 20 s for something to change.
      events({ since }) {
        const now = new Date()
        return this.api('/events?wait=20&since=' + enc(since || ''), { timeout: 30000 }).then((d) => ({
          e: d.events.map((e) => compactEvent(e, now)).filter(Boolean),
          k: d.cursor,
          r: d.reset ? 1 : 0,
        }))
      },
      prefs() {
        const s = storage()
        return Promise.resolve({
          quick: quickReplies(s.getItem('quickReplies')),
          confirm: s.getItem('confirmSend') === 'false' ? 0 : 1,
          hide: s.getItem('hidePreview') === 'true' ? 1 : 0,
        })
      },
    },

    onRequest(req, res) {
      const h = this.handlers[req.method]
      if (!h) {
        res(null, { err: 'server', msg: 'unknown request ' + req.method })
        return
      }
      Promise.resolve()
        .then(() => h.call(this, req.params || {}))
        .then(
          (data) => res(null, Object.assign({ ok: 1 }, data)),
          (e) => res(null, { err: e.code || 'server', msg: e.message }),
        )
    },

    // The settings page's Test connection button writes "test"; the result
    // goes back in "testResult" for the page to show.
    onSettingsChange({ key }) {
      if (key !== 'test') return
      this.api('/ping').then(
        (d) => storage().setItem('testResult', JSON.stringify({ ok: 1, state: d.state, me: d.me })),
        (e) => storage().setItem('testResult', JSON.stringify({ err: e.code || 'server', msg: e.message })),
      )
    },
  }),
)
