import { useRouter } from 'expo-router';

import { Onboarding } from '@/ui/onboarding';

/** The intro again, opened from Account. Done or Skip goes back there. */
export default function OnboardingScreen() {
  const router = useRouter();
  return (
    <Onboarding
      onDone={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/you');
      }}
    />
  );
}
