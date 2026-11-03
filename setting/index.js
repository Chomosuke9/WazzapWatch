// The Wazzap page of the Zepp app on the phone: where the watch finds the
// computer, and how it behaves. Everything is kept in settingsStorage,
// which the side service reads.

import { DEFAULT_QUICK } from '../shared/convert'

const ERRORS = {
  setup: 'Isi alamat server dan token dulu.',
  offline: 'Komputer tidak terjangkau. Pastikan WazzapClients berjalan dan HP terhubung ke Tailscale.',
  token: 'Token salah. Salin lagi dari WazzapClients.',
  whatsapp: 'Terhubung, tapi WhatsApp di komputer belum tersambung.',
}

function testText(raw) {
  if (!raw) return ''
  let r
  try {
    r = JSON.parse(raw)
  } catch (e) {
    return ''
  }
  if (r.ok) return 'Terhubung' + (r.me ? ' sebagai ' + r.me : '') + (r.state === 'online' ? '.' : ' (WhatsApp: ' + r.state + ').')
  return ERRORS[r.err] || 'Gagal: ' + (r.msg || r.err)
}

AppSettingsPage({
  build(props) {
    const s = props.settingsStorage
    const get = (k, d = '') => {
      const v = s.getItem(k)
      return v == null ? d : v
    }
    const result = testText(get('testResult'))
    return View({ style: { padding: '12px 16px' } }, [
      Section({ title: 'Server' }, [
        TextInput({
          label: 'Alamat server',
          placeholder: 'http://100.x.y.z:8642',
          value: get('server'),
          onChange: (v) => s.setItem('server', v.trim()),
        }),
        TextInput({
          label: 'Token',
          placeholder: 'Settings › Extra features › Smartwatch',
          value: get('token'),
          onChange: (v) => s.setItem('token', v.trim()),
        }),
        Button({
          label: 'Tes koneksi',
          color: 'primary',
          onClick: () => {
            s.setItem('testResult', '')
            s.setItem('test', String(Date.now()))
          },
        }),
        result ? Text({ paragraph: true, style: { marginTop: '8px' } }, result) : null,
      ].filter(Boolean)),
      Section({ title: 'Di jam' }, [
        Toggle({
          label: 'Konfirmasi sebelum mengirim',
          value: get('confirmSend', 'true') !== 'false',
          onChange: (v) => s.setItem('confirmSend', v ? 'true' : 'false'),
        }),
        Toggle({
          label: 'Sembunyikan isi pesan di daftar chat',
          value: get('hidePreview') === 'true',
          onChange: (v) => s.setItem('hidePreview', v ? 'true' : 'false'),
        }),
      ]),
      Section({ title: 'Balasan cepat', description: 'Satu balasan per baris, paling banyak 8.' }, [
        TextInput({
          label: 'Balasan cepat',
          multiline: true,
          rows: 5,
          value: get('quickReplies', DEFAULT_QUICK.join('\n')),
          onChange: (v) => s.setItem('quickReplies', v),
        }),
      ]),
    ])
  },
})
