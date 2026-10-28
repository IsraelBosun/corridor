import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useStore } from '@/data/store';
import { space, themed } from '@/theme/tokens';
import { showDialog } from '@/ui/dialog';
import { PlaceSearch } from '@/ui/place-search';
import { Text } from '@/ui/text';

/**
 * Where are you getting off.
 *
 * The one place a rider says where they are going. It used to be three: a
 * list of stops on the You tab, a separate search screen that saved nothing,
 * and the trip cards guessing from whichever had been set. Picking a place
 * here sets it, and the home map and list answer to it straight away.
 *
 * One current place is stored, overwritten on the next pick. No history.
 */
export default function FindScreen() {
  const router = useRouter();
  const { dropOff, setDropOff, role } = useStore();
  const driver = role === 'driver';

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <PlaceSearch
      placeholder="Search an estate, junction or street"
      intro={
        driver
          ? 'Where you usually head after work, anywhere in Lagos. It is filled in each time you offer a ride, and you can change it for any one ride.'
          : 'Type an estate, a bus stop, a junction or a street near home, anywhere in Lagos. It is where you get off on the way home and where you are picked up on the way to work. You will see the rides whose road passes close to it.'
      }
      current={dropOff?.name}
      onBack={back}
      onPick={async (p) => {
        await setDropOff({ name: p.name, lat: p.lat, lng: p.lng });
        back();
      }}
      // Riders can use where they are now. The one place serves both ways, so
      // it only makes sense near home, and the name is shown before it is saved.
      offerHere={!driver}
      hereNote="Best used when you are at or near home"
      onPickHere={(p) =>
        showDialog(`Use ${p.name}?`, 'It is where you are picked up in the morning and where you get off in the evening.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Use it',
            onPress: async () => {
              await setDropOff({ name: p.name, lat: p.lat, lng: p.lng });
              back();
            },
          },
        ])
      }
      // Riders can change their place but not clear it: no place, no rides.
      after={
        dropOff && driver ? (
          <Pressable
            onPress={async () => {
              await setDropOff(null);
              back();
            }}
            style={s.clear}
            accessibilityRole="button">
            <Text variant="small" tone="stop" style={s.bold}>
              Clear where I usually go
            </Text>
          </Pressable>
        ) : null
      }
      privacy="We keep this one place and nothing else about where you go. Picking a new one replaces it."
    />
  );
}

const s = themed(() =>
  StyleSheet.create({
  clear: { paddingVertical: space.lg },
  bold: { fontWeight: '600' },
  })
);
