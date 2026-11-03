// The system keyboard, typed or spoken (API 4.0).

import { createKeyboard, deleteKeyboard, inputType } from '@zos/ui'

// openKeyboard asks for text and calls done with it (trimmed), unless it
// was cancelled or empty.
export function openKeyboard(voice, text, done) {
  createKeyboard({
    inputType: voice ? inputType.VOICE : inputType.CHAR,
    text: text || '',
    onComplete: (_, result) => {
      deleteKeyboard()
      const t = ((result && result.data) || '').trim()
      if (t) done(t)
    },
    onCancel: () => deleteKeyboard(),
  })
}
