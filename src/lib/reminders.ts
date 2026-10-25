/**
 * The 06:00 and 15:00 reminders, Monday to Friday.
 *
 * At 06:00 drivers are nudged to post their ride to work, and riders to look
 * for one; rides to work leave from 05:30 to 10:00 and are posted the same
 * morning. At 15:00 the same for the ride home: rides start appearing from
 * about 16:00, so 15:00 lands before anyone has packed up.
 *
 * These are local notifications, scheduled on the phone itself. Nothing goes
 * through a server, they arrive with no signal, and turning them off in
 * Account cancels them on the spot. The choice is kept on this phone.
 *
 * A driver's regular ride is posted for them, so on the days and the way it
 * runs the "post your ride" nudge is left out. The database sends a note
 * about that ride instead, at 06:00 or 16:00
 * (supabase/migrations/20261024120000_regular_ride_reminders_and_12_hour.sql).
 *
 * Expo Go on Android throws as soon as expo-notifications is imported (SDK 53
 * took it out), so the module is loaded only in a real build. In Expo Go the
 * app runs without reminders rather than not at all.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { backend } from '@/data/backend';
import type { Direction, Role } from '@/data/types';
import { registerForPush } from '@/lib/push';

const KEY = 'corridor.reminders';
const CHANNEL = 'reminders';
/** Every one of ours starts with this, morning ones included, so one sweep cancels them all. */
const PREFIX = 'corridor-3pm-';
/** Monday to Friday, in the trigger's numbering where 1 is Sunday (so ISO day + 1). */
const WEEKDAYS = [2, 3, 4, 5, 6];

/** True in Expo Go and on web, where these notifications cannot be used. */
export const REMINDERS_UNAVAILABLE =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let loaded: typeof NotificationsModule | null | undefined;

/** The trip whose chat is on screen, so its own messages do not buzz. */
let openChat: string | null = null;

/** Called by the chat screen as it comes into and goes out of view. */
export function setOpenChat(tripId: string | null) {
  openChat = tripId;
}

/** expo-notifications, or null where it cannot run. Loaded on first use. */
function notifications(): typeof NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  if (REMINDERS_UNAVAILABLE) return (loaded = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: typeof NotificationsModule = require('expo-notifications');
    // A reminder or push that arrives while the app is open still shows as a
    // banner, unless it is a message in the chat already on screen.
    mod.setNotificationHandler({
      handleNotification: async (n) => {
        const reading = openChat !== null && n.request.content.data?.url === `/chat/${openChat}`;
        return {
          shouldShowBanner: !reading,
          shouldShowList: !reading,
          shouldPlaySound: !reading,
          shouldSetBadge: false,
        };
      },
    });
    loaded = mod;
  } catch {
    loaded = null;
  }
  return loaded;
}

type Copy = { title: string; body: string; url: string };

/** When each reminder goes, and what it says to each side. */
const SLOTS: { id: string; hour: number; direction: Direction; copy: Record<Role, Copy> }[] = [
  {
    id: 'am-',
    hour: 6,
    direction: 'work',
    copy: {
      driver: {
        title: 'Driving to work this morning?',
        body: 'Post your ride so people along your road can grab a seat.',
        url: '/post?direction=work',
      },
      passenger: {
        title: 'Heading to work?',
        body: 'Rides to work are being posted. Look for one that passes near you.',
        url: '/',
      },
    },
  },
  {
    id: '',
    hour: 15,
    direction: 'home',
    copy: {
      driver: {
        title: 'Driving home tonight?',
        body: 'Post your ride so people heading your way can grab a seat.',
        url: '/post?direction=home',
      },
      passenger: {
        title: 'Heading home tonight?',
        body: 'Rides start appearing from about 4 PM. Set where you get off and watch for one going your way.',
        url: '/',
      },
    },
  },
];

/** On unless turned off in Account. */
export async function remindersOn(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function setRemindersOn(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY, on ? 'on' : 'off').catch(() => {
    // Lost on restart at worst; the schedule below still changes now.
  });
}

async function cancelOurs(N: typeof NotificationsModule) {
  const all = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier))
  );
}

/** "work-1": the ways and ISO weekdays a driver's running regular rides cover. */
async function regularRideDays(): Promise<Set<string>> {
  const covered = new Set<string>();
  try {
    for (const plan of await backend.listPlans()) {
      if (plan.active) for (const day of plan.weekdays) covered.add(`${plan.direction}-${day}`);
    }
  } catch {
    // Offline: every nudge, which is how it was before regular rides.
  }
  return covered;
}

export type SyncResult = 'scheduled' | 'off' | 'denied' | 'unavailable' | 'failed';

/**
 * Make the phone's schedule match the person: their role's wording, or none
 * at all when reminders are off or not allowed. Safe to call as often as
 * needed; it replaces rather than adds.
 */
export async function syncReminders(role: Role, askPermission = true): Promise<SyncResult> {
  const N = notifications();
  if (!N) return 'unavailable';
  try {
    if (!(await remindersOn())) {
      await cancelOurs(N);
      return 'off';
    }

    let { granted, canAskAgain } = await N.getPermissionsAsync();
    if (!granted && canAskAgain && askPermission) {
      ({ granted } = await N.requestPermissionsAsync());
    }
    if (!granted) {
      await cancelOurs(N);
      return 'denied';
    }

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CHANNEL, {
        name: 'Ride reminders',
        description: 'A nudge at 6 AM and 3 PM on weekdays to post or look for a ride.',
        importance: N.AndroidImportance.DEFAULT,
      });
    }

    const covered = role === 'driver' ? await regularRideDays() : new Set<string>();

    await cancelOurs(N);
    await Promise.all(
      SLOTS.flatMap((slot) =>
        WEEKDAYS.filter((weekday) => !covered.has(`${slot.direction}-${weekday - 1}`)).map((weekday) => {
          const copy = slot.copy[role];
          return N.scheduleNotificationAsync({
            identifier: `${PREFIX}${slot.id}${weekday}`,
            // iOS stays silent unless a sound is asked for. Android takes it from the channel.
            content: { title: copy.title, body: copy.body, sound: 'default', data: { url: copy.url } },
            trigger: {
              type: N.SchedulableTriggerInputTypes.WEEKLY,
              channelId: CHANNEL,
              weekday,
              hour: slot.hour,
              minute: 0,
            },
          });
        })
      )
    );
    return 'scheduled';
  } catch {
    return 'failed';
  }
}

/**
 * Where a tapped reminder or push should open, if it is one of ours. Pushes
 * from the database carry data.push (supabase/migrations/20261019200000_ride_and_chat_push.sql).
 */
function reminderUrl(response: NotificationsModule.NotificationResponse | null): string | null {
  if (!response) return null;
  const { identifier, content } = response.notification.request;
  if (!identifier.startsWith(PREFIX) && content.data?.push !== true) return null;
  const url = content.data?.url;
  return typeof url === 'string' ? url : null;
}

const handled = new Set<string>();

/**
 * Keeps the schedule in step with the person's role, and opens the right
 * screen when a reminder is tapped, whether that tap opened the app or
 * arrived while it was running. Mounted once, on the home screen.
 */
export function useReminders(role: Role) {
  const router = useRouter();

  // One after the other, so the phone never asks for permission twice at once.
  useEffect(() => {
    syncReminders(role).finally(() => registerForPush(notifications()));
  }, [role]);

  useEffect(() => {
    const N = notifications();
    if (!N) return;

    const open = (response: NotificationsModule.NotificationResponse | null) => {
      const url = reminderUrl(response);
      if (!url || !response) return;
      const id = `${response.notification.request.identifier}:${response.notification.date}`;
      if (handled.has(id)) return;
      handled.add(id);
      if (url !== '/') router.push(url as '/post');
    };

    N.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = N.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
