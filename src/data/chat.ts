import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { hasPhone } from '@/lib/phones';
import type { Minutes } from '@/lib/time';
import { backend, type MessageRow } from './backend';

/**
 * Trip chat.
 *
 * Scoped to one trip and nothing else. There are no direct messages in this
 * product, so there is no inbox, no thread list and no way to start a
 * conversation with someone you are not sharing a car with tonight. The
 * backend enforces that: only the driver and the confirmed riders can read or
 * write a trip's messages.
 *
 * Messages live and die with the trip. When the overnight purge removes the
 * trip, the conversation goes with it.
 */

export type Message = {
  id: string;
  authorId: string;
  body: string;
  atMin: Minutes;
  /** Optimistic rows are on screen but not yet acknowledged by the backend. */
  pending?: boolean;
};

function toMessage(row: MessageRow): Message {
  const d = new Date(row.created_at);
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    atMin: d.getHours() * 60 + d.getMinutes(),
  };
}

/**
 * A phone number cannot be typed into a trip chat even by someone determined
 * to. That is a product rule, so the person deserves to be told why rather
 * than shown a constraint error.
 */
const NO_PHONES = 'Phone numbers stay out of the trip chat. Say it here instead.';

export function useTripChat(tripId: string | undefined, meId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!tripId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const rows = (await backend.listMessages(tripId)).map(toMessage);
      seen.current = new Set(rows.map((m) => m.id));
      // Anything still sending stays on screen until its own reply lands.
      setMessages((all) => [...rows, ...all.filter((m) => m.pending)]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the chat.');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates only arrive while the app is in front. Coming back to it,
  // fetch the lot so what was said in the meantime appears.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!tripId) return;
    return backend.onMessage(tripId, (row) => {
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      // Drop any optimistic copy of this message before appending the real
      // one, or the sender sees their own line twice.
      setMessages((all) => [...all.filter((m) => !m.pending || m.body !== row.body), toMessage(row)]);
    });
  }, [tripId]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text || !tripId || !meId) return false;

      if (hasPhone(text)) {
        setError(NO_PHONES);
        return false;
      }

      // Show it immediately. A chat that waits on a round trip before echoing
      // what you typed feels broken on a car park's worth of signal.
      const optimistic: Message = {
        id: 'pending-' + Date.now(),
        authorId: meId,
        body: text,
        atMin: new Date().getHours() * 60 + new Date().getMinutes(),
        pending: true,
      };
      setMessages((all) => [...all, optimistic]);
      setError(null);

      try {
        const row = await backend.sendMessage(tripId, meId, text);
        seen.current.add(row.id);
        // The live update can land before this reply does and add the row
        // first, so drop any copy of it as well as the optimistic one.
        setMessages((all) => [...all.filter((m) => m.id !== optimistic.id && m.id !== row.id), toMessage(row)]);
        return true;
      } catch (e) {
        setMessages((all) => all.filter((m) => m.id !== optimistic.id));
        const msg = e instanceof Error ? e.message : '';
        setError(
          msg.includes('messages_no_phone_numbers')
            ? NO_PHONES
            : 'That did not send. Check your signal and try again.'
        );
        return false;
      }
    },
    [tripId, meId]
  );

  return { messages, loading, error, send, clearError: () => setError(null) };
}
