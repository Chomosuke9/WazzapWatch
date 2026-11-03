// The side service runs in the Zepp app on the phone. It asks WazzapClients'
// API (Settings > Extra features > Smartwatch access on the computer) for
// what the watch requests, and answers with the short objects of
// shared/convert.js, since Bluetooth is slow.
//
// Every answer is { ok: 1, ... } or { err, msg }: err is "setup" (no
// address or token yet), "offline" (the computer can't be reached),
// "token" (wrong token), "whatsapp" (WhatsApp isn't connected there) or
// "server" (anything else, msg says what).
//
// Pictures go to the watch as files: the computer sends a small PNG, the
// side service converts it to the watch's format and sends it over
// Bluetooth, and the watch's app.js hands it to utils/files.js. The
// request answers once the file is on its way.

import { BaseSideService } from '@zeppos/zml/base-side'
import {
  compactChat,
  compactEvent,
  compactFound,
  compactMessage,
  quickReplies,
  serverURL,
} from '../shared/convert'

const storage = () => settings.settingsStorage

function fail(err, msg, status) {
  const e = new Error(msg || err)
  e.code = err
  e.status = status
  return e
}

// fileName makes a file name from an ID: chat and message IDs have @ and
// dots in them.
function fileName(prefix, id) {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0
  return prefix + h.toString(36)
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
          if (res.status >= 400) throw fail('server', data.error || 'HTTP ' + res.status, res.status)
          return data
        },
        () => {
          throw fail('offline')
        },
      )
    },

    // picture downloads a PNG from the computer, converts it for the
    // watch and sends it there with params. name is the file's name,
    // without a directory.
    picture(path, name, params, timeout = 45000) {
      const server = serverURL(storage().getItem('server'))
      const token = (storage().getItem('token') || '').trim()
      if (!server || !token) return Promise.reject(fail('setup'))
      const png = 'data://download/' + name + '.png'
      const out = 'data://download/w_' + name + '.png'
      return new Promise((resolve, reject) => {
        const task = this.download(server + '/v1' + path, {
          headers: { Authorization: 'Bearer ' + token },
          timeout,
          filePath: name + '.png',
        })
        task.onSuccess = (d) => {
          const status = d && (d.statusCode || d.status)
          if (status >= 400) reject(fail(status === 401 ? 'token' : 'server', "Couldn't get the picture (HTTP " + status + ')', status))
          else resolve()
        }
        task.onFail = () => reject(fail('offline'))
      })
        .then(() => this.convert({ filePath: png, targetFilePath: out }))
        .then(
          () => {
            this.sendFile(out, params)
            return { sent: 1 }
          },
          (e) => {
            // A JSON error the download saved instead of a picture.
            throw e && e.code ? e : fail('server', "Couldn't convert the picture")
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
      // react sets your reaction to a message; emoji '' takes it back.
      react({ chat, id, emoji }) {
        return this.api('/chats/' + enc(chat) + '/messages/' + enc(id) + '/react', {
          method: 'POST',
          body: { emoji: emoji || '' },
        }).then(() => ({}))
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
      // search finds chats by name and messages by text.
      search({ q }) {
        const now = new Date()
        return this.api('/search?limit=15&q=' + enc(q), { timeout: 20000 }).then((d) => ({
          c: d.chats.map((c) => compactChat(c, now)),
          m: d.messages.map((f) => compactFound(f, now)),
          done: d.complete ? 1 : 0,
        }))
      },
      // avatar sends a chat's profile picture, a circle of size px, unless
      // the watch has version have already. It answers { v } with the
      // picture's version, plus same (the watch's is current), sent (it's
      // coming as a file), or none (the chat has no picture) or pending
      // (the computer is still fetching it: ask again later).
      avatar({ chat, size, have }) {
        return this.api('/chats/' + enc(chat) + '/photo/version', { timeout: 25000 }).then(
          (d) => {
            if (d.pending) return { pending: 1 }
            if (d.version === have) return { v: d.version, same: 1 }
            const path = '/chats/' + enc(chat) + '/photo?size=' + (size || 58)
            return this.picture(path, fileName('av_', chat) + '_' + d.version, { kind: 'av', chat, v: d.version }, 20000).then(
              () => ({ v: d.version, sent: 1 }),
            )
          },
          (e) => {
            if (e.status === 404) return { none: 1 }
            throw e
          },
        )
      },
      // photo sends a message's picture, fitted to w x h.
      photo({ chat, id, w, h }) {
        const path = '/chats/' + enc(chat) + '/messages/' + enc(id) + '/image?pad=1&w=' + w + '&h=' + h
        return this.picture(path, fileName('ph_', chat + '/' + id), { kind: 'ph', chat, id })
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
