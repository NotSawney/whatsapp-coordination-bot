import readline from 'node:readline';
import type { Channel, MessageHandler } from './channel.js';

/**
 * Canal de terminal para el demo: cada línea es un mensaje del número `from`.
 * Permite probar el bot sin WhatsApp.
 */
export function createCliChannel(from: string): Channel {
  let rl: readline.Interface | undefined;

  return {
    async start(handler: MessageHandler) {
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log(`CLI conectada como ${from}. Escribí un mensaje (Ctrl+C para salir).`);
      rl.setPrompt('> ');
      rl.prompt();

      rl.on('line', async (line) => {
        const text = line.trim();
        if (!text) return rl!.prompt();
        try {
          const reply = await handler({ from, text });
          console.log(`\n${reply}\n`);
        } catch (e) {
          console.error('Error:', (e as Error).message);
        }
        rl!.prompt();
      });
    },

    async stop() {
      rl?.close();
    },
  };
}
