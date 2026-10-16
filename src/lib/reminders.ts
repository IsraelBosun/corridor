/**
 * The 15:00 reminder, Monday to Friday.
 *
 * Drivers are nudged to post tonight's ride; riders to set where they get off
 * and watch for one. Rides start appearing from about 16:00, so 15:00 lands
 * before anyone has packed up.
 *
 * These are local notifications, scheduled on the phone itself. Nothing goes
 * through a server, they arrive with no signal, and turning them off in
 * Account cancels them on the spot. The choice is kept on this phone.
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

import type { Role } from '@/data/types';

const KEY = 'corridor.reminders';
const CHANNEL = 'reminders';
const PREFIX = 'corridor-3pm-';
const HOUR = 15;
/** Monday to Friday, in the trigger's numbering where 1 is Sunday. */
const WEEKDAYS = [2, 3, 4, 5, 6];

/** True in Expo Go and on web, where these notifications cannot be used. */
export const REMINDERS_UNAVAILABLE =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let loaded: typeof NotificationsModule | null | undefined;

/** expo-notifications, or null where it cannot run. Loaded on first use. */
function notifications(): typeof NotificationsModule | null {
  if (loaded !== undefined) return loaded;
  if (REMINDERS_UNAVAILABLE) return (loaded = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: typeof NotificationsModule = require('expo-notifications');
    // A reminder that arrives while the app is open still shows as a banner.
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    loaded = mod;
  } catch {
    loaded = null;
  }
  return loaded;
}

const COPY: Record<Role, { title: string; body: string; url: string }> = {
  driver: {
    title: 'Driving home tonight?',
    body: 'Post your ride so people heading your way can grab a seat.',
    url: '/post',
  },
  passenger: {
    title: 'Heading home tonight?',
    body: 'Rides start appearing from about 16:00. Set where you get off and watch for one going your way.',
    url: '/',
  },
};

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
        description: 'A nudge at 15:00 on weekdays to post or look for a ride home.',
        importance: N.AndroidImportance.DEFAULT,
      });
    }

    await cancelOurs(N);
    const copy = COPY[role];
    await Promise.all(
      WEEKDAYS.map((weekday) =>
        N.scheduleNotificationAsync({
          identifier: `${PREFIX}${weekday}`,
          content: { title: copy.title, body: copy.body, data: { url: copy.url } },
          trigger: {
            type: N.SchedulableTriggerInputTypes.WEEKLY,
            channelId: CHANNEL,
            weekday,
            hour: HOUR,
            minute: 0,
          },
        })
      )
    );
    return 'scheduled';
  } catch {
    return 'failed';
  }
}

/** Where a tapped reminder should open, if it is one of ours. */
function reminderUrl(response: NotificationsModule.NotificationResponse | null): string | null {
  if (!response) return null;
  if (!response.notification.request.identifier.startsWith(PREFIX)) return null;
  const url = response.notification.request.content.data?.url;
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

  useEffect(() => {
    syncReminders(role);
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
