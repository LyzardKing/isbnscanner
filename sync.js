import * as Y from 'https://esm.sh/yjs@13.6.31'
import { IndexeddbPersistence } from 'https://esm.sh/y-indexeddb@9.0.12'
import { WebrtcProvider } from 'https://esm.sh/y-webrtc@10.3.0'

const SIGNALING = ['wss://y-webrtc-xoxg.onrender.com']
const ROOM_KEY = 'isbnscanner-sync-room'

const ADJS = ['summer','winter','autumn','spring','golden','silver','crimson','azure','amber','copper','quiet','bold','calm','wild','swift','bright','cool','dark','free','keen','soft','warm','pale','deep','rare','tall','snowy','misty']
const NOUNS = ['fox','wolf','bear','hawk','owl','deer','mole','frog','hare','lynx','puma','swan','crab','seal','dove','bass','lark','newt','rail','wren','kite','sole','oriole','crane']

let doc, booksMap, persistence, provider
let connectedPeers = 0, isConnected = false, currentRoom = null
const changeListeners = [], statusListeners = []

function rand(a) { return a[Math.random() * a.length | 0] }
function genRoom() { return `${rand(ADJS)}-${rand(NOUNS)}-${Math.random().toString(16).slice(2,6)}` }
function loadRoom() { return localStorage.getItem(ROOM_KEY) || (r => (localStorage.setItem(ROOM_KEY, r), r))(genRoom()) }
function saveRoom(r) { localStorage.setItem(ROOM_KEY, r) }

function notifyStatus() {
  const s = { connected: isConnected, peers: connectedPeers, room: currentRoom }
  statusListeners.forEach(f => f(s))
}

function connect(room) {
  if (provider) { provider.destroy(); provider = null }
  currentRoom = room; saveRoom(room)
  provider = new WebrtcProvider(room, doc, { signaling: SIGNALING })
  provider.on('status', ev => { isConnected = !!ev.connected; notifyStatus() })
  provider.awareness.on('change', () => {
    connectedPeers = Math.max(0, provider.awareness.getStates().size - 1)
    notifyStatus()
  })
}

function disconnect() {
  if (provider) { provider.destroy(); provider = null }
  isConnected = false; connectedPeers = 0; currentRoom = null
  notifyStatus()
}

export async function initialize() {
  doc = new Y.Doc()
  booksMap = doc.getMap('books')
  persistence = new IndexeddbPersistence('isbnscanner-yjs', doc)
  await new Promise(r => persistence.on('synced', r))

  connect(loadRoom())

  booksMap.observeDeep(() => { changeListeners.forEach(f => f()) })

  window.syncAPI = {
    getAllBooks: () => Array.from(booksMap.values()),
    getBook: isbn => booksMap.get(isbn),
    saveBook: data => { doc.transact(() => { booksMap.set(data.isbn, data) }) },
    saveBooks: books => { doc.transact(() => { books.forEach(b => booksMap.set(b.isbn, b)) }) },
    deleteBook: isbn => { doc.transact(() => { booksMap.delete(isbn) }) },
    clearAllBooks: () => { doc.transact(() => { booksMap.clear() }) },
    getRoom: () => currentRoom,
    setRoom: room => { disconnect(); connect(room) },
    disconnect: () => disconnect(),
    getStatus: () => ({ connected: isConnected, peers: connectedPeers, room: currentRoom }),
    onChange: cb => { changeListeners.push(cb) },
    onStatusChange: cb => { statusListeners.push(cb) },
  }

  return window.syncAPI
}
