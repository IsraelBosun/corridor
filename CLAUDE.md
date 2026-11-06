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

- Every ride has a direction: `work` (morning, 05:00 to 10:00 since 2026-11-01) or `home` (evening, 16:00 to 23:00). Since 2026-11-01 a one off ride can be posted up to 7 days ahead (`20261101120000_rides_ahead.sql`), one each way per Lagos day. One live ride per driver and one seat per rider, each way. A ride keeps its direction once posted.
- Morning rides are picked up along the way: the rider's one profile place is where they are picked up in the morning and where they get off in the evening. `depart_trip()` keeps unpicked riders on a `work` ride; the driver checks them in as they get in. This fixes the old "picking up on the way" problem.
- Live location (lib/live.ts, ui/live.tsx): from 30 minutes before departure, while Corridor is open, the driver shares until the ride is over and each rider until they are in the car. Riders see the car; the driver sees waiting riders; riders never see each other. Latest point only, in `corridor.live_positions`, read through `ride_positions()`. Anyone can pause it per ride.
- A morning rider gets a push when their driver is within 500 m of their pickup, once per ride.
- Background sharing arrives in version 1.1.0: see below.
- Regular rides (migration `20261021130000_regular_rides.sql`): a driver picks weekdays under Repeat when posting. `corridor.ride_plans` holds the schedule; `post_planned_rides()` posts each day's ride, called by the app on every ride list load (pg_cron too, if it exists). Edits and cancels change that day only; Account > Regular rides pauses or stops a schedule.

## Version 1.1.0: built 2026-11-06, not released yet

Everything that could not go by OTA. Code is done and bundles, but nothing has been tried on a real phone, and the Kotlin in `modules/play-update` is first compiled by the EAS build.

- Background location: `lib/background-sharing.ts`, defined through the custom entry `index.ts` (a route file is not loaded when the phone starts the JavaScript with no screen). It calls `share_position()` every 10 seconds, even when parked, because the ride ends only after 3 minutes at the destination. `live.ts` still does the on screen sharing for anyone who did not allow it.
- It can only START while Corridor is open inside the ride's window, because Android and iOS refuse a start from the background. Swiping the app away stops it.
- The permission is offered once, the first time a person is in a ride's window, not at booking. That is the moment it matters, and it also catches car owners on weekly rides. The dialog text is the notice Google requires. "Not now" is not asked again; the phone's settings still work.
- iOS keychain: the session is now saved with AFTER_FIRST_UNLOCK so a locked phone can read it and save a refreshed token. Overwriting keeps the old setting, so `keepSessionReadableWhileLocked()` deletes and rewrites it once. Do not remove this: a refresh that cannot be saved signs the person out.
- Still on screen only: the Start ride and Picked up banners (`ui/ride-prompt.tsx`) and the safety route recording (`lib/tracking.ts`).
- Play in-app updates: our own `modules/play-update` calls Google's `app-update` library, because `expo-in-app-updates` lists SDK 56 and 58+, not 57. It uses the immediate flow, is skipped during a ride, and shows at most every 3 days. It only works on an install from Play.
- Rating prompt: `lib/review.ts` with `expo-store-review`, from the ride complete screen after the 3rd finished ride, then every 10. The store decides whether it shows, so no "Rate us" button may depend on it, and there is no "are you enjoying Corridor?" filter or reward. It does not appear in TestFlight.
- Notification icon: `assets/images/notification-icon.png`, also the Android location notification's icon.
- No Google Maps SDK or key is needed for this build. The app does not use `react-native-maps` (it is installed but never imported): `ui/map.tsx` draws Mapbox tiles itself, and search and routes are Mapbox web calls. Moving to Google later means Google's web APIs, with the key held in a Supabase edge function, so it needs no build. Check Google's terms first, including tile caching in `expo-image` and the attribution rules.

Release order:
1. Commit the new update dialog (`StoreUpdates`, `NEWEST_IN_STORE` in `lib/updates.ts`, `STORE` exports in `lib/push.ts`) separately, on version 1.0.0, without the native imports, so a 1.0.0 OTA can be published from that commit.
2. Build 1.1.0. iOS goes to review now. Android waits for Play's full approval.
3. Once a store has approved it, set `NEWEST_IN_STORE` for that store and publish from a 1.0.0 branch. Old builds only hear about the new version this way.
4. From then on `app.json` says 1.1.0, so an OTA from main reaches only 1.1.0 builds. Never publish an OTA from code with `expo-task-manager` or `expo-store-review` to runtime 1.0.0: those builds do not have them and would crash.

The owner must: fill in Play's background location declaration with a short video, explain background location in Apple's review notes, and update the privacy policy and both stores' privacy answers (the policy is not in this repo).
