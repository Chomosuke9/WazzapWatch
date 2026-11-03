// The reactions the watch offers, WhatsApp's six, and pictures of them
// (Noto Emoji, assets/*/emoji): the watch's font may not draw emoji.
// Other emoji in reactions show as text.

// QUICK are the reactions the message page offers, in WhatsApp's order.
export const QUICK = [
  { e: '👍', name: 'like' },
  { e: '❤️', name: 'heart' },
  { e: '😂', name: 'laugh' },
  { e: '😮', name: 'wow' },
  { e: '😢', name: 'sad' },
  { e: '🙏', name: 'thanks' },
]

// plain drops what varies within one emoji: the emoji presentation
// selector and skin tones, so ❤ is ❤️ and 👍🏽 is 👍.
export function plain(e) {
  return Array.from(e || '')
    .filter((ch) => {
      const c = ch.codePointAt(0)
      return c !== 0xfe0f && !(c >= 0x1f3fb && c <= 0x1f3ff)
    })
    .join('')
}

const PLAIN = {}
for (const q of QUICK) PLAIN[plain(q.e)] = q.name

// emojiImage is the picture of an emoji, size "s" (28 px) or "l" (60 px),
// or '' when there's none.
export function emojiImage(e, size) {
  const name = PLAIN[plain(e)]
  return name ? 'emoji/' + name + '_' + size + '.png' : ''
}

// sameEmoji says whether two reactions are the same emoji.
export function sameEmoji(a, b) {
  return !!a && !!b && plain(a) === plain(b)
}
