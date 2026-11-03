import { BaseApp } from '@zeppos/zml/base-app'
import { received } from './utils/files'

App(
  BaseApp({
    globalData: {},
    onCreate() {
      // ZML gives the phone 5 s to answer its handshake before every
      // request, too little for a side service the Zepp app is still
      // starting; the request then fails as if the phone were away.
      const m = this.globalData.messaging
      if (m && m.shakeTimeout < 15000) m.shakeTimeout = 15000
    },
    // Every file from the side service comes here (utils/files.js).
    onReceivedFile(file) {
      received(file)
    },
  }),
)
