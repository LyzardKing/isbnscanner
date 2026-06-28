import * as Y from 'https://esm.sh/yjs@13.6.31'
import { IndexeddbPersistence } from 'https://esm.sh/y-indexeddb@9.0.12'
import { WebrtcProvider } from 'https://esm.sh/y-webrtc@10.3.0'

const SIGNALING = ['wss://y-webrtc-xoxg.onrender.com']
const ROOM_KEY = 'isbnscanner-sync-room'
const PWD_KEY = 'isbnscanner-sync-password'

const ADJS = ['summer','winter','autumn','spring','golden','silver','crimson','azure','amber','copper','quiet','bold','calm','wild','swift','bright','cool','dark','free','keen','soft','warm','pale','deep','rare','tall','snowy','misty']
const NOUNS = ['fox','wolf','bear','hawk','owl','deer','mole','frog','hare','lynx','puma','swan','crab','seal','dove','bass','lark','newt','rail','wren','kite','sole','oriole','crane']

let doc, booksMap, persistence, provider
let connectedPeers = 0, isConnected = false, currentRoom = null, currentPassword = null
const changeListeners = [], statusListeners = []

function rand(a) { return a[Math.random() * a.length | 0] }
function genRoom() { return `${rand(ADJS)}-${rand(NOUNS)}-${Math.random().toString(16).slice(2,6)}` }
function genPassword() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
function loadRoom() { return localStorage.getItem(ROOM_KEY) || (r => (localStorage.setItem(ROOM_KEY, r), r))(genRoom()) }
function saveRoom(r) { localStorage.setItem(ROOM_KEY, r) }
function loadPassword() {
  let pwd = localStorage.getItem(PWD_KEY)
  if (!pwd) {
    pwd = genPassword()
    localStorage.setItem(PWD_KEY, pwd)
  }
  return pwd
}

function notifyStatus() {
  const s = { connected: isConnected, peers: connectedPeers, room: currentRoom, password: !!currentPassword }
  statusListeners.forEach(f => f(s))
}

function connect(room, password) {
  if (provider) { provider.destroy(); provider = null }
  currentRoom = room
  currentPassword = password || ''
  saveRoom(room)
  localStorage.setItem(PWD_KEY, currentPassword)
  const opts = { signaling: SIGNALING }
  if (currentPassword) opts.password = currentPassword
  provider = new WebrtcProvider(room, doc, opts)
  provider.on('status', ev => { isConnected = !!ev.connected; notifyStatus() })
  provider.awareness.on('change', () => {
    connectedPeers = Math.max(0, provider.awareness.getStates().size - 1)
    notifyStatus()
  })
}

function disconnect() {
  if (provider) { provider.destroy(); provider = null }
  isConnected = false; connectedPeers = 0; currentRoom = null; currentPassword = null
  notifyStatus()
}

export async function initialize() {
  doc = new Y.Doc()
  booksMap = doc.getMap('books')
  const settingsMap = doc.getMap('settings')
  persistence = new IndexeddbPersistence('isbnscanner-yjs', doc)
  await new Promise(r => persistence.on('synced', r))

  const pwd = loadPassword()
  connect(loadRoom(), pwd)

  booksMap.observeDeep(() => { changeListeners.forEach(f => f()) })
  settingsMap.observeDeep(() => { changeListeners.forEach(f => f()) })

  window.syncAPI = {
    getAllBooks: () => Array.from(booksMap.values()),
    getBook: isbn => booksMap.get(isbn),
    saveBook: data => { doc.transact(() => { booksMap.set(data.isbn, data) }) },
    saveBooks: books => { doc.transact(() => { books.forEach(b => booksMap.set(b.isbn, b)) }) },
    deleteBook: isbn => { doc.transact(() => { booksMap.delete(isbn) }) },
    clearAllBooks: () => { doc.transact(() => { booksMap.clear() }) },
    getSetting: key => settingsMap.get(key),
    setSetting: (key, value) => { doc.transact(() => { settingsMap.set(key, value) }) },
    getRoom: () => currentRoom,
    getPassword: () => currentPassword,
    getRoomCode: () => currentRoom ? `${currentRoom}|${currentPassword}` : null,
    setRoom: code => {
      const parts = code.split('|')
      const room = parts[0].trim()
      const pwd = parts.length > 1 ? parts[1].trim() : loadPassword()
      disconnect()
      connect(room, pwd)
    },
    disconnect: () => disconnect(),
    getStatus: () => ({ connected: isConnected, peers: connectedPeers, room: currentRoom, password: !!currentPassword }),
    onChange: cb => { changeListeners.push(cb) },
    onStatusChange: cb => { statusListeners.push(cb) },
  }

  return window.syncAPI
}
