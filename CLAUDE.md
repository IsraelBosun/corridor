@AGENTS.md

## AI features: planned, on hold

Do not build any of this until the owner says go (decided 2026-10-17).

- Provider: DeepSeek, chosen because it is cheaper. Not Claude or OpenAI.
- Call it only from a Supabase edge function, like `corridor-work-email`. The API key is a Supabase secret that the owner sets. It never goes in the app or in `.env`.
- Candidate features:
  1. Report triage in Watch Tower: summarise a report together with its ride's chat and history, and suggest how serious it is. Admin-only, no store release. Start here.
  2. Flag chat messages that look like harassment or scams to Watch Tower. Never block the message or tell the sender.
  3. Post a ride by typing ("leaving 7pm to Lekki, 3 seats, 1500"), which fills the ride form for the driver to check.
  4. Plain-English questions about the data in Watch Tower.
- Features 1, 2 and 4 send ride and chat data to DeepSeek, which processes it in China. Update the privacy policy and the App Store privacy labels before 2 or 4 go live.

## Morning rides and live location: built 2026-10-21

Built on the owner's go (2026-10-21), as an OTA with migration `20261021120000_morning_rides_and_live_location.sql`. This replaces the "Find my car" plan.

- Every ride has a direction: `work` (morning, 05:30 to 10:00) or `home` (evening, 16:00 to 23:00), posted the same day. One live ride per driver and one seat per rider, each way. A ride keeps its direction once posted.
- Morning rides are picked up along the way: the rider's one profile place is where they are picked up in the morning and where they get off in the evening. `depart_trip()` keeps unpicked riders on a `work` ride; the driver checks them in as they get in. This fixes the old "picking up on the way" problem.
- Live location (lib/live.ts, ui/live.tsx): from 30 minutes before departure, while Corridor is open, the driver shares until the ride is over and each rider until they are in the car. Riders see the car; the driver sees waiting riders; riders never see each other. Latest point only, in `corridor.live_positions`, read through `ride_positions()`. Anyone can pause it per ride.
- A morning rider gets a push when their driver is within 500 m of their pickup, once per ride.
- Foreground only. Background sharing needs a native build (persistent Android notification, Play background-location declaration, Apple review). Do it only if people turn out to close the app while waiting.
- Regular rides (migration `20261021130000_regular_rides.sql`): a driver picks weekdays under Repeat when posting. `corridor.ride_plans` holds the schedule; `post_planned_rides()` posts each day's ride, called by the app on every ride list load (pg_cron too, if it exists). Edits and cancels change that day only; Account > Regular rides pauses or stops a schedule.
- The iOS location permission text in app.json still describes only the map and the safety recording. Update it in the next native build to mention sharing with the ride.

## Notification icon too small: known, on hold

Leave as is until the owner says go (noted 2026-10-21).

- On Android the "C" in the status bar looks smaller than other apps' icons. The `expo-notifications` plugin in `app.json` uses `assets/images/android-icon-monochrome.png`, the launcher's monochrome icon, whose glyph fills only about 34% x 40% of the canvas (launcher safe-zone padding).
- Fix: a separate notification icon, a white "C" on transparent filling about 85 to 90% of the canvas, set as the plugin's `icon`. Keep the launcher icon unchanged.
- Needs a new native build. An OTA update cannot change it.

## Next native build: add Play in-app updates

Do this in the next Android build (decided 2026-10-21).

- Add Google Play's in-app update prompt (native, so it cannot ship by OTA). It lets people update from inside the app instead of going to the store.
- Until then, old builds are nudged by an OTA screen that opens `market://details?id=com.bluehydra.corridor`.
