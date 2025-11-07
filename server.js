import 'dotenv/config'
import express from 'express'
import QRCode from 'qrcode'
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys'
import Pino from 'pino'
import fs from 'fs'
import path from 'path'

const app = express()
app.use(express.json())

const TOKEN = process.env.WAWP_TOKEN || ''
const PORT = process.env.PORT || 3000
const AUTH_DIR = process.env.AUTH_DIR || './auth'
const logger = Pino({ level: 'error' })

let sock = null
let lastQR = null
let stateReady = false

// Simple bearer auth middleware
function auth(req, res, next){
  if (!TOKEN) return next() // allow if no token set (not recommended for production)
  const h = req.get('authorization') || ''
  if (h === `Bearer ${TOKEN}`) return next()
  return res.status(401).json({ code: 'unauthorized', message: 'Bad or missing token' })
}

// Create or reuse Baileys connection
async function ensureSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  stateReady = true
  const { version } = await fetchLatestBaileysVersion()
  sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    logger
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u) => {
    const { qr, connection, lastDisconnect } = u
    if (qr) {
      lastQR = await QRCode.toDataURL(qr)
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
      if (shouldReconnect) {
        ensureSock().catch(()=>{})
      } else {
        // logout
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }) } catch {}
        sock = null
        lastQR = null
      }
    }
  })
  return sock
}

app.get('/status', auth, async (req,res)=>{
  const connected = !!(sock && sock.user)
  res.json({
    connected,
    device: connected ? sock.user : null,
    qr: (!connected && lastQR) ? lastQR : null
  })
})

app.post('/connect', auth, async (req,res)=>{
  if (!stateReady || !sock) await ensureSock()
  // If already connected, just return status
  const connected = !!(sock && sock.user)
  if (connected) return res.json({ connected, device: sock.user })
  // If not connected, lastQR should be available
  if (!lastQR) {
    // force restart to trigger QR
    await ensureSock()
  }
  return res.json({ qr: lastQR })
})

app.post('/logout', auth, async (req,res)=>{
  try{
    if (sock) await sock.logout()
  }catch(_){}
  try{ fs.rmSync(AUTH_DIR, { recursive:true, force:true }) }catch(_){}
  sock = null
  lastQR = null
  res.json({ ok: true })
})

app.post('/send', auth, async (req,res)=>{
  try{
    const { to, message } = req.body || {}
    if (!to || !message) return res.status(400).json({ code:'bad_request', message:'to and message are required' })
    if (!sock || !sock.user) await ensureSock()
    if (!sock.user) return res.status(409).json({ code:'not_connected', message:'Device not connected. Scan QR first.' })
    // normalize number to WhatsApp JID
    const jid = to.replace(/\D+/g,'') + '@s.whatsapp.net'
    const resp = await sock.sendMessage(jid, { text: message })
    res.json({ ok:true, id: resp?.key?.id || null })
  }catch(e){
    console.error(e)
    res.status(500).json({ code:'send_error', message: e.message })
  }
})

app.listen(PORT, ()=>{
  console.log(`WaWp Gateway listening on :${PORT}`)
  // warm start
  ensureSock().catch(()=>{})
})
