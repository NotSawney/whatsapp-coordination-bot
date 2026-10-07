import type { Channel, MessageHandler } from './channel.js';

/**
 * Adaptador WhatsApp vía Baileys (no oficial, sesión por QR).
 * FRÁGIL a propósito y aislado: si la sesión se cae, reconecta salvo logout.
 * Import dinámico para no cargar Baileys cuando se usa el canal CLI.
 */
export async function createBaileysChannel(authDir = 'auth_info_baileys'): Promise<Channel> {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { useMultiFileAuthState, DisconnectReason } = baileys;
  const qrcode = (await import('qrcode-terminal')).default;

  let sock: ReturnType<typeof makeWASocket> | undefined;
  let stopped = false;

  async function connect(handler: MessageHandler) {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
      if (u.qr) qrcode.generate(u.qr, { small: true });
      if (u.connection === 'open') console.log('WhatsApp conectado.');
      if (u.connection === 'close') {
        const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output
          ?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        if (!stopped && !loggedOut) {
          console.log('Conexión caída, reconectando…');
          void connect(handler);
        } else if (loggedOut) {
          console.log('Sesión cerrada. Borrá', authDir, 'y reescaneá el QR.');
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue;
        const text = m.message.conversation ?? m.message.extendedTextMessage?.text;
        const from = m.key.remoteJid;
        if (!text || !from) continue;
        try {
          const reply = await handler({ from, text });
          await sock!.sendMessage(from, { text: reply });
        } catch (e) {
          console.error('Error atendiendo mensaje:', (e as Error).message);
          await sock!.sendMessage(from, { text: 'Uy, se me complicó. Probá de nuevo.' });
        }
      }
    });
  }

  return {
    async start(handler: MessageHandler) {
      console.log('Iniciando WhatsApp (Baileys). Escaneá el QR cuando aparezca.');
      await connect(handler);
    },
    async stop() {
      stopped = true;
      sock?.end(undefined);
    },
  };
}
