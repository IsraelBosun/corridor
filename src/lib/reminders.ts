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
 */
import * as Notifications from 'expo-notifications';
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

// A reminder that arrives while the app is open still shows as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const COPY: Record<Role, { title: string; body: string; url: string }> = {
  driver: {
    title: 'Driving home tonight?',
    body: 'Post your ride so colleagues heading your way can grab a seat.',
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

async function cancelOurs() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

export type SyncResult = 'scheduled' | 'off' | 'denied' | 'failed';

/**
 * Make the phone's schedule match the person: their role's wording, or none
 * at all when reminders are off or not allowed. Safe to call as often as
 * needed; it replaces rather than adds.
 */
export async function syncReminders(role: Role, askPermission = true): Promise<SyncResult> {
  try {
    if (!(await remindersOn())) {
      await cancelOurs();
      return 'off';
    }

    let { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (!granted && canAskAgain && askPermission) {
      ({ granted } = await Notifications.requestPermissionsAsync());
    }
    if (!granted) {
      await cancelOurs();
      return 'denied';
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Ride reminders',
        description: 'A nudge at 15:00 on weekdays to post or look for a ride home.',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await cancelOurs();
    const copy = COPY[role];
    await Promise.all(
      WEEKDAYS.map((weekday) =>
        Notifications.scheduleNotificationAsync({
          identifier: `${PREFIX}${weekday}`,
          content: { title: copy.title, body: copy.body, data: { url: copy.url } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
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
export function reminderUrl(response: Notifications.NotificationResponse | null): string | null {
  if (!response) return null;
  if (!response.notification.request.identifier.startsWith(PREFIX)) return null;
  const url = response.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
}

const handled = new Set<string>();

/**
 * Keeps the schedule in step with the person's role, and opens the right
 * screen when a reminder is tapped. Mounted once, on the home screen.
 */
export function useReminders(role: Role) {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    syncReminders(role);
  }, [role]);

  useEffect(() => {
    const url = reminderUrl(last ?? null);
    const id = last?.notification.request.identifier + ':' + last?.notification.date;
    if (!url || handled.has(id)) return;
    handled.add(id);
    if (url !== '/') router.push(url as '/post');
  }, [last, router]);
}
