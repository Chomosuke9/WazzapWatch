// Files from the side service: profile pictures and the photos a chat
// opens (see app-side/index.js's picture). ZML hands every file to the
// app's onReceivedFile (app.js), which calls received. A page's own
// onReceivedFile would be dropped for every page when one page closes, so
// pages listen here instead.
//
// A listener gets { file, params, state, loaded, size }: state is
// "progress", "done" (file.filePath is the picture) or "error".
//
// zeus bundles the app and each page apart, each with its own copy of
// this module, so what they share lives in the app's globalData.

import { rmSync } from '@zos/fs'

// shared is the state every bundle sees.
export function shared() {
  return getApp()._options.globalData
}

function listeners() {
  const g = shared()
  if (!g.fileListeners) g.fileListeners = new Set()
  return g.fileListeners
}

export function onFile(f) {
  listeners().add(f)
  return () => listeners().delete(f)
}

function tell(file, state, loaded, size) {
  const e = { file, params: file.params || {}, state, loaded: loaded || 0, size: size || file.fileSize || 0 }
  for (const f of Array.from(listeners())) {
    try {
      f(e)
    } catch (err) {
      console.log('wazzap: file listener: ' + err)
    }
  }
}

export function received(file) {
  if (!file) return
  if (file.readyState === 'transferred') {
    tell(file, 'done')
    return
  }
  file.on('progress', (e) => tell(file, 'progress', e.data.loadedSize, e.data.fileSize))
  file.on('change', (e) => {
    const st = e.data.readyState
    if (st === 'transferred') tell(file, 'done')
    else if (st === 'error' || st === 'canceled') tell(file, 'error')
  })
}

// remove deletes a received file that's no longer needed.
export function remove(path) {
  if (!path) return
  try {
    rmSync({ path: path.replace(/^data:\/\//, '') })
  } catch (e) {
    console.log('wazzap: remove ' + path + ': ' + e)
  }
}
