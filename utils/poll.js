// poll follows what changes on the computer while a page is open: it asks
// the side service for events again and again (each request waits up to
// 20 s on the computer), and hands them to onEvents. cursor is where to
// start; with none, the first answer only gives one. onReset runs when the
// watch fell too far behind and must load everything again. It returns a
// function that stops it.
export function poll(page, cursor, onEvents, onReset) {
  let since = cursor || ''
  let stopped = false
  let timer = null

  const again = (ms) => {
    if (!stopped) timer = setTimeout(loop, ms)
  }

  function loop() {
    timer = null
    if (stopped) return
    page
      .request({ method: 'events', params: { since } }, { timeout: 45000 })
      .then((d) => {
        if (stopped) return
        if (!d || d.err) {
          again(5000) // the computer or the phone is away: try again soon
          return
        }
        const first = since === ''
        since = d.k
        if (d.r) {
          if (!first) onReset()
        } else if (d.e && d.e.length) {
          onEvents(d.e)
        }
        again(0)
      })
      .catch(() => again(5000))
  }

  loop()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

// nonce names a message to send, so it isn't sent twice if the request
// is sent again.
export function nonce() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
