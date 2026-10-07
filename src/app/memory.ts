import type { Msg } from '../agent/agent.js';

/**
 * Memoria conversacional por usuario: ventana de los últimos N mensajes.
 * En memoria (se pierde al reiniciar), suficiente para flujos cortos de reserva.
 */
export class ConversationMemory {
  private store = new Map<string, Msg[]>();

  constructor(private readonly maxMessages = 10) {}

  get(key: string): Msg[] {
    return this.store.get(key) ?? [];
  }

  set(key: string, msgs: Msg[]): void {
    this.store.set(key, msgs.slice(-this.maxMessages));
  }
}
