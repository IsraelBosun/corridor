import { Callout } from './primitives';
import { ShieldIcon } from './icons';
import { Text } from './text';

/**
 * Said wherever a ride on the road is shown, so nobody is recorded without
 * being told. See lib/tracking.ts for what is recorded and when.
 */
export function RecordingNotice() {
  return (
    <Callout icon={<ShieldIcon />}>
      <Text variant="small" tone="muted">
        For safety, your location is recorded while this ride is on the road and Corridor is open. Only you
        and the Corridor safety team can see it, and it is deleted after 90 days.
      </Text>
    </Callout>
  );
}
