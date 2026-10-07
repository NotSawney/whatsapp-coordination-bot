import { Employee } from '../domain/types.js';
import { dispatch, tools, type ToolContext } from './tools.js';

// --- tipos de mensajes (forma OpenAI, se pasan tal cual al proveedor) --------

export interface ToolCall {
  id: string;
  type?: 'function';
  function: { name: string; arguments: string };
}

export interface AssistantMsg {
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Un LLM: dado el historial y las tools, devuelve el mensaje del asistente. Inyectable. */
export type LLM = (messages: Msg[], tools: OpenAITool[]) => Promise<AssistantMsg>;

// --- schemas de tools en formato OpenAI --------------------------------------

export function openAiTools(): OpenAITool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// --- prompt de sistema -------------------------------------------------------

export function buildSystemPrompt(actor: Employee, now: number): string {
  return [
    'Sos el asistente de préstamo de equipos de una empresa. Respondé en español, breve y claro.',
    `Usuario actual: ${actor.name} (rol: ${actor.role}).`,
    `Fecha y hora actual (ISO 8601): ${new Date(now).toISOString()}.`,
    'Usá SIEMPRE las herramientas para consultar o modificar reservas; nunca inventes disponibilidad, IDs ni resultados.',
    'Convertí fechas relativas ("mañana", "el viernes 15h") a ISO 8601 usando la fecha actual.',
    'Para reservar necesitás el activo y la hora de devolución estimada (end); si falta, preguntá antes de llamar la herramienta.',
    'Si una herramienta devuelve un campo "error", explicáselo al usuario con naturalidad y, si corresponde, ofrecé una alternativa.',
  ].join('\n');
}

// --- loop de tool-calling (puro, testeable) ----------------------------------

export interface AgentOptions {
  systemPrompt: string;
  maxSteps?: number;
}

const FALLBACK_EMPTY = 'No pude generar una respuesta. ¿Lo reformulás?';
const FALLBACK_STUCK = 'Me enredé procesando el pedido. ¿Podés decirlo más simple?';

/**
 * Corre la conversación hasta que el LLM responde sin pedir más tools.
 * Parse defensivo: si el modelo free manda argumentos JSON rotos, se le
 * devuelve un error como resultado de tool para que reintente, en vez de crashear.
 */
export async function runAgentLoop(
  llm: LLM,
  history: Msg[],
  toolCtx: ToolContext,
  opts: AgentOptions,
): Promise<string> {
  const messages: Msg[] = [{ role: 'system', content: opts.systemPrompt }, ...history];
  const toolDefs = openAiTools();
  const maxSteps = opts.maxSteps ?? 5;

  for (let step = 0; step < maxSteps; step++) {
    const msg = await llm(messages, toolDefs);
    const calls = msg.tool_calls ?? [];

    if (calls.length === 0) {
      return (msg.content ?? '').trim() || FALLBACK_EMPTY;
    }

    // El mensaje del asistente con tool_calls debe ir ANTES de los resultados.
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ error: 'Argumentos JSON inválidos; reintentá con JSON bien formado.' }),
        });
        continue;
      }
      const result = dispatch(call.function.name, toolCtx, args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return FALLBACK_STUCK;
}
