import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useStore } from '@/data/store';
import { space, themed } from '@/theme/tokens';
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
          : 'Type where you get off, anywhere in Lagos: an estate, a bus stop, a mall or a street. You will see the rides whose road passes close to it.'
      }
      current={dropOff?.name}
      onBack={back}
      onPick={async (p) => {
        await setDropOff({ name: p.name, lat: p.lat, lng: p.lng });
        back();
      }}
      after={
        dropOff ? (
          <Pressable
            onPress={async () => {
              await setDropOff(null);
              back();
            }}
            style={s.clear}
            accessibilityRole="button">
            <Text variant="small" tone="stop" style={s.bold}>
              {driver ? 'Clear where I usually go' : 'Clear where I get off'}
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
