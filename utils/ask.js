// ask sends a request to the side service, as page.request does, and tries
// again when it doesn't get through. The Zepp app starts the side service
// only when the app opens (and may stop it in the background), and the
// watch drops Bluetooth now and then to save power, so a request often
// fails once; one that fails three more times is the phone really being
// away. The side service's own errors ({ err }) come back as answers and
// aren't tried again.
//
// Sends are safe to try again: their nonce keeps them from going twice.

const WAITS = [1500, 4000, 8000]

export function ask(page, method, params, opts) {
  let n = 0
  const go = () =>
    page.request({ method, params: params || {} }, opts).catch((e) => {
      console.log('wazzap: ' + method + ' failed (try ' + (n + 1) + '): ' + describe(e))
      if (page.gone || n >= WAITS.length) throw e
      const ms = WAITS[n++]
      return new Promise((resolve) => setTimeout(resolve, ms)).then(go)
    })
  return go()
}

// ZML's transport errors, by their code.
const REASONS = {
  1: 'no answer from the phone',
  2: 'Bluetooth dropped',
  3: 'side service not running',
  4: 'timed out',
}

// reason says in a few words why a request didn't get through.
export function reason(e) {
  if (e && REASONS[e.code]) return REASONS[e.code]
  return describe(e)
}

export function describe(e) {
  if (!e) return 'unknown'
  const code = e.code != null ? '[' + e.code + '] ' : ''
  return code + (e.reason || e.message || String(e))
}

// failed is for a bug in the page's own code, so it doesn't pass for the
// phone being away.
export function failed(where, e) {
  console.log('wazzap: ' + where + ': ' + describe(e) + (e && e.stack ? '\n' + e.stack : ''))
  return describe(e)
}
