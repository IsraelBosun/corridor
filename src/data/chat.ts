import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { hasPhone } from '@/lib/phones';
import type { Minutes } from '@/lib/time';
import { backend, type MessageRow } from './backend';

/**
 * Trip chat.
 *
 * Scoped to one trip and nothing else. There are no direct messages in this
 * product, so there is no inbox and no way to start a conversation that is not
 * about a ride. Two kinds of chat hang off a ride, and the backend enforces
 * both:
 *   - the group chat: only the car owner and the confirmed riders.
 *   - a question thread: one rider asking the car owner about the ride before
 *     booking. Only the two of them see it, the rider starts it, and it closes
 *     when the ride leaves (supabase/migrations/20261030120000_ride_questions.sql).
 *
 * Messages are kept with the trip, for good, as the record of what was said.
 * Only the people on the ride can read them in the app.
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

/** Refusals from the question rules, worded for people. Shown as they come. */
const QUESTION_REFUSALS = [
  'Wait for the car owner to reply before you send more.',
  'This ride has left, so questions about it are closed.',
  'Riders start these chats. Wait for a question.',
  'You cannot message about this ride.',
  'This is your own ride.',
];

/**
 * A ride's chat. With askerId, that rider's question thread with the car owner
 * instead of the group chat.
 */
export function useTripChat(tripId: string | undefined, meId: string | undefined, askerId?: string) {
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
      const rows = (await backend.listMessages(tripId, askerId)).map(toMessage);
      seen.current = new Set(rows.map((m) => m.id));
      // Anything still sending stays on screen until its own reply lands.
      setMessages((all) => [...rows, ...all.filter((m) => m.pending)]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the chat.');
    } finally {
      setLoading(false);
    }
  }, [tripId, askerId]);

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
      // The group chat and each question thread share the ride's feed.
      if ((row.asker_id ?? undefined) !== askerId) return;
      if (seen.current.has(row.id)) return;
      seen.current.add(row.id);
      // Drop any optimistic copy of this message before appending the real
      // one, or the sender sees their own line twice.
      setMessages((all) => [
        ...all.filter((m) => !m.pending || m.body !== row.body || m.authorId !== row.author_id),
        toMessage(row),
      ]);
    });
  }, [tripId, askerId]);

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
        const row = await backend.sendMessage(tripId, meId, text, askerId);
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
            : QUESTION_REFUSALS.find((r) => msg.includes(r)) ??
                'That did not send. Check your signal and try again.'
        );
        return false;
      }
    },
    [tripId, meId, askerId]
  );

  return { messages, loading, error, send, clearError: () => setError(null) };
}

/** One rider's questions about a ride, as the car owner's list shows them. */
export type QuestionThread = {
  askerId: string;
  last: Message;
  /** The rider spoke last, so the car owner owes a reply. */
  waiting: boolean;
};

/**
 * The question threads on a ride, newest first. For the car owner, every
 * rider who asked; for a rider, only their own. Off until enabled, so a ride
 * card does not ask on behalf of people who cannot have questions.
 */
export function useQuestions(tripId: string | undefined, enabled: boolean) {
  const [rows, setRows] = useState<MessageRow[]>([]);

  const load = useCallback(async () => {
    if (!tripId || !enabled) return setRows([]);
    try {
      setRows(await backend.listQuestions(tripId));
    } catch {
      // A count that cannot load is left as it was. The chat itself says why.
    }
  }, [tripId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    if (!tripId || !enabled) return;
    return backend.onMessage(tripId, (row) => {
      if (!row.asker_id) return;
      setRows((all) => (all.some((r) => r.id === row.id) ? all : [...all, row]));
    });
  }, [tripId, enabled]);

  const threads: QuestionThread[] = [];
  for (const row of rows) {
    const asker = row.asker_id!;
    const at = threads.findIndex((t) => t.askerId === asker);
    const thread = { askerId: asker, last: toMessage(row), waiting: row.author_id === asker };
    if (at >= 0) threads.splice(at, 1);
    threads.unshift(thread);
  }
  return { threads, waiting: threads.filter((t) => t.waiting).length, reload: load };
}
