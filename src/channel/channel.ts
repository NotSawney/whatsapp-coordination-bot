export interface IncomingMessage {
  from: string; // identificador del remitente (teléfono o JID de WhatsApp)
  text: string;
}

/** Recibe un mensaje y devuelve el texto de respuesta a enviar. */
export type MessageHandler = (msg: IncomingMessage) => Promise<string>;

/** Un canal de entrada/salida de mensajes. El dominio no sabe cuál es. */
export interface Channel {
  start(handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}
