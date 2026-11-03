// The Wazzap page of the Zepp app on the phone: where the watch finds the
// computer, and how it behaves. Everything is kept in settingsStorage,
// which the side service reads. Its "test" key asks the side service to
// ping the computer; the answer comes back in "testResult".

import { DEFAULT_QUICK } from '../shared/convert'

const GREEN = '#1FAF5F'
const INK = '#1B1F23'
const SUB = '#6B7378'
const LINE = '#E6E9EB'

const S = {
  page: { padding: '16px 14px 28px', background: '#F2F4F5', minHeight: '100vh', boxSizing: 'border-box' },
  hero: {
    background: 'linear-gradient(135deg, #25C76F 0%, #128C4A 100%)',
    borderRadius: '20px',
    padding: '22px 20px',
    marginBottom: '14px',
  },
  heroTitle: { color: '#FFFFFF', fontSize: '26px', fontWeight: '700', letterSpacing: '-0.3px' },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: '14px', lineHeight: '20px', marginTop: '6px' },
  card: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '14px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  cardTitle: { color: INK, fontSize: '17px', fontWeight: '700', marginBottom: '4px' },
  cardSub: { color: SUB, fontSize: '13px', lineHeight: '18px', marginBottom: '10px' },
  label: { color: SUB, fontSize: '13px', fontWeight: '600' },
  input: {
    color: INK,
    fontSize: '15px',
    background: '#F5F7F8',
    border: '1px solid ' + LINE,
    borderRadius: '10px',
    padding: '10px 12px',
    marginTop: '6px',
    wordBreak: 'break-all',
  },
  field: { marginBottom: '12px' },
  button: { width: '100%', borderRadius: '12px', fontSize: '16px', fontWeight: '600', marginTop: '4px' },
  hint: { color: SUB, fontSize: '12px', lineHeight: '17px', margin: '-4px 0 12px' },
  step: { color: INK, fontSize: '14px', lineHeight: '20px', marginBottom: '8px' },
  stepNo: { color: GREEN, fontWeight: '700' },
  footer: { color: '#9AA1A6', fontSize: '12px', textAlign: 'center', marginTop: '6px' },
}

// FAILURES word the side service's errors (app-side/index.js).
const FAILURES = {
  setup: ['Not set up', 'Enter the server address and the token below.'],
  offline: ["Can't reach your computer", 'Check that WazzapClients is running with Smartwatch access on, and that this phone is on Tailscale.'],
  token: ['Wrong token', 'Copy the token again from WazzapClients.'],
  whatsapp: ['WhatsApp is offline', "Your computer answered, but WazzapClients isn't connected to WhatsApp."],
}

// status is what the connection card says: a color, a title and a line.
function status(raw, configured) {
  let r = null
  try {
    r = raw ? JSON.parse(raw) : null
  } catch (e) {}
  if (!configured) return { color: '#9AA1A6', title: 'Not set up', line: 'Fill in the server address and the token to get started.' }
  if (!r) return { color: '#9AA1A6', title: 'Not tested yet', line: 'Press Test connection to check that the watch can reach your computer.' }
  if (r.pending) return { color: '#E0A030', title: 'Testing…', line: 'Asking your computer through this phone.' }
  if (r.ok) {
    const who = r.me ? 'Signed in as ' + r.me : 'Your computer answered'
    if (r.state === 'online') return { color: GREEN, title: 'Connected', line: who + '. WhatsApp is online.' }
    return { color: '#E0A030', title: 'Connected', line: who + '. WhatsApp: ' + r.state + '.' }
  }
  const f = FAILURES[r.err]
  if (f) return { color: '#E04B4B', title: f[0], line: f[1] }
  return { color: '#E04B4B', title: 'Something went wrong', line: r.msg || r.err || 'Unknown error' }
}

// masked shows the end of the token only; it's as good as a password.
function masked(token) {
  if (!token) return ''
  return '••••••••' + token.slice(-4)
}

AppSettingsPage({
  build(props) {
    const s = props.settingsStorage
    const get = (k, d = '') => {
      const v = s.getItem(k)
      return v == null ? d : v
    }
    const set = (k, v) => s.setItem(k, v)
    const server = get('server')
    const token = get('token')
    const st = status(get('testResult'), !!(server && token))

    const card = (children) => View({ style: S.card }, children.filter(Boolean))
    const title = (t, sub) => [Text({ bold: true, style: S.cardTitle }, t), sub ? Text({ paragraph: true, style: S.cardSub }, sub) : null]
    const hint = (t) => Text({ paragraph: true, style: S.hint }, t)
    const field = (input) => View({ style: S.field }, [input])
    const changed = (k, v) => {
      set(k, v)
      set('testResult', '') // what was tested isn't what's set any more
    }

    return View({ style: S.page }, [
      View({ style: S.hero }, [
        Text({ bold: true, style: S.heroTitle }, 'Wazzap'),
        Text({ paragraph: true, style: S.heroSub }, 'Your WhatsApp chats on your wrist, served by WazzapClients on your computer.'),
      ]),

      card([
        View({ style: { display: 'flex', alignItems: 'center' } }, [
          View({ style: { width: '12px', height: '12px', borderRadius: '6px', background: st.color, marginRight: '10px', flexShrink: '0' } }, []),
          Text({ bold: true, style: { color: INK, fontSize: '17px', fontWeight: '700' } }, st.title),
        ]),
        Text({ paragraph: true, style: { color: SUB, fontSize: '13px', lineHeight: '18px', margin: '6px 0 12px 22px' } }, st.line),
        Button({
          label: 'Test connection',
          color: 'primary',
          style: S.button,
          onClick: () => {
            set('testResult', JSON.stringify({ pending: 1 }))
            set('test', String(Date.now()))
          },
        }),
      ]),

      card([
        ...title('Computer', 'On your computer, open WazzapClients › Settings › Extra features › Smartwatch access.'),
        field(
          TextInput({
            label: 'Server address',
            placeholder: 'http://100.x.y.z:8642',
            value: server,
            labelStyle: S.label,
            subStyle: S.input,
            onChange: (v) => changed('server', v.trim()),
          }),
        ),
        field(
          TextInput({
            label: 'Token',
            placeholder: 'Paste the token here',
            value: masked(token),
            labelStyle: S.label,
            subStyle: S.input,
            onChange: (v) => {
              v = v.trim()
              if (v.indexOf('•') >= 0) return // the masked one, unchanged
              changed('token', v)
            },
          }),
        ),
        hint('Anyone with the token can read and send your messages. Make a new one in WazzapClients if it leaks.'),
      ]),

      card([
        ...title('On the watch'),
        Toggle({
          label: 'Confirm before sending',
          value: get('confirmSend', 'true') !== 'false',
          onChange: (v) => set('confirmSend', v ? 'true' : 'false'),
        }),
        hint('Show typed and spoken replies before they go. Quick replies always go at once.'),
        Toggle({
          label: 'Hide message previews',
          value: get('hidePreview') === 'true',
          onChange: (v) => set('hidePreview', v ? 'true' : 'false'),
        }),
        hint('The chat list shows names and times only, so nobody reads your messages over your shoulder.'),
      ]),

      card([
        ...title('Quick replies', 'One per line, up to 8. They show under Type and Voice when you reply.'),
        TextInput({
          label: 'Replies',
          multiline: true,
          rows: 6,
          value: get('quickReplies', DEFAULT_QUICK.join('\n')),
          labelStyle: S.label,
          subStyle: Object.assign({}, S.input, { whiteSpace: 'pre-line', lineHeight: '22px' }),
          onChange: (v) => set('quickReplies', v),
        }),
      ]),

      card([
        ...title('How to connect'),
        ...[
          'Turn on Smartwatch access in WazzapClients on your computer.',
          'Install Tailscale on this phone and sign in to the same tailnet as your computer.',
          'Copy the server address and the token here, then press Test connection.',
        ].map((t, i) =>
          View({ style: { display: 'flex' } }, [
            Text({ bold: true, style: Object.assign({}, S.step, S.stepNo, { width: '22px', flexShrink: '0' }) }, i + 1 + '.'),
            Text({ paragraph: true, style: S.step }, t),
          ]),
        ),
      ]),

      Text({ paragraph: true, style: S.footer }, 'Wazzap · github.com/Chomosuke9/WazzapWatch'),
    ])
  },
})
