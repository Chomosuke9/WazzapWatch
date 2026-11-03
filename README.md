# WazzapWatch

Wazzap for Amazfit: a Zepp OS mini program that shows your WhatsApp chats on an
Amazfit watch and lets you answer them. It doesn't talk to WhatsApp itself:
[WazzapClients](https://github.com/Chomosuke9/WazzapClients), the desktop app,
does, and serves the open account through **Settings › Extra features ›
Smartwatch access** (its
[`internal/remote`](https://github.com/Chomosuke9/WazzapClients/tree/main/internal/remote)
package, which documents the API). Made for the Bip Max
(432×514, square), and laid out for round screens too. Needs Zepp OS API 4.0
(the system keyboard and voice input).

```
watch (page/)  ⇄ Bluetooth ⇄  Zepp app on the phone (app-side/)  ⇄ HTTP over Tailscale ⇄  WazzapClients
```

- `page/home` lists the chats, `page/chat` shows a conversation (15 messages
  at a time, at most 45, 30 on the page at once so it scrolls smoothly),
  `page/reply` types, speaks or picks a quick reply,
  `page/search` finds chats by name and messages by text, `page/photo`
  shows a message's photo or sticker, loaded only when it's opened, and
  `page/msg` (a message tapped twice) reacts to it or replies to it. Reactions show
  as pictures of WhatsApp's six (Noto Emoji, `LICENSES/noto-emoji.txt`),
  since the watch's font may not draw emoji.
  Each page follows changes while it's open (`utils/poll.js`, a long poll).
- Pictures come to the watch as files: the computer sends a small PNG, the
  side service converts it to the watch's format and sends it over Bluetooth,
  and `app.js` hands it to `utils/files.js`. Profile pictures load one at a
  time as the list shows chats and are kept on the watch (`utils/avatars.js`).
  zeus bundles each page apart, with its own copy of every module, so what
  pages share lives in the app's `globalData`.
- `app-side/index.js` runs in the Zepp app: it calls the computer and answers
  the watch with the short objects of `shared/convert.js`, labels and times
  already worded, since Bluetooth is slow.
- `setting/index.js` is the app's page in the Zepp app: the computer's address
  and token, Test connection, whether to confirm before sending, hiding message
  text in the list, and the quick replies.
- `utils/ui.js` holds the colors, the screen's margins (square screens keep the
  system's 64 px status bar, which shows the page's title) and drawing helpers.

## Build and install

```sh
npm install               # ZML and the API typings
npm test                  # shared/convert.js
npm i -g @zeppos/zeus-cli # once; it doesn't work as a local dependency
zeus build                # dist/*.zab
zeus login                # your Zepp developer account
zeus preview              # a QR code for the Zepp app (Profile › Settings › Developer mode)
```

`app.json`'s `appId` belongs to the maintainer's Zepp account. To install a
build of your own, create an app in the
[Zepp developer console](https://console.zepp.com) and put its ID there before
`zeus preview`.

## Connect it

1. In WazzapClients, turn on **Smartwatch access** and copy the server address
   (the computer's Tailscale address, port 8642) and the token.
2. Install Tailscale on the phone and sign in to the same tailnet.
3. In the Zepp app, open Wazzap's settings, paste both and press
   **Test connection**.

## Development

- Read the API before using it: Zepp OS changes between API levels, and much of
  what's online is for 1.0 or 2.0. `npm install` brings the typings
  (`node_modules/@zeppos/device-types/dist/index.d.ts`) and ZML's source and
  examples (`node_modules/@zeppos/zml`); the docs are at https://docs.zepp.com.
- zeus-cli must be installed globally: as a local dependency its `module-alias`
  reads this project's `package.json` and can't find `zeppos-app-utils`.
- The pages only draw; anything that can be worked out without the watch goes
  in `shared/convert.js`, where `npm test` checks it.
- The API's JSON belongs to WazzapClients. When it changes there, change
  `shared/convert.js` and its tests here.

## License

MPL-2.0, like WazzapClients.

## Not checked on a watch yet

The app builds, and `shared/convert.js` is tested, but it hasn't run on the
simulator or a watch. Worth checking first: the system keyboard's voice input
on the Bip Max, the page title in the status bar (`updateStatusBarTitle`), the
✓ glyphs of the receipts in the watch's font, and the memory a page of 45
messages takes (`getPerformance('memory')` from `@zos/app`).
