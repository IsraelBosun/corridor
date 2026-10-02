# Corridor

Corridor is a carpool app for colleagues going home after work. Drivers heading somewhere post a ride. Riders say where they get off, see the rides whose road passes close to it, and take a free seat. Everyone leaves together from the office pickup point.

It is a notice board between colleagues, not a transport service. No money changes hands, and nothing about where people have been is kept.

Built with [Expo](https://expo.dev) (SDK 57), Expo Router, React Native, Supabase and Mapbox.

---

## What it does

**For riders**
- Search any place in Lagos as your usual drop off.
- See tonight's rides, with the ones whose road passes your drop off first.
- Take a seat, check in at the pickup, message the ride, and confirm when you are dropped off.

**For drivers**
- Offer a ride: where you are going, when you leave (16:00 to 23:00), and how many seats.
- See every rider's drop off numbered on the map, in the order you reach them.
- Start the ride and mark everyone dropped off.

**Accounts**
- Sign in with a personal email and password.
- Prove you are a colleague with a 6 digit code sent to your work email. This is checked again every 60 days, so leaving a job ends access without deleting the account.
- One account can switch between riding and driving in Account.

**Also**
- Light, dark, or follow the phone.
- A three slide intro on first open, which can be replayed from Account.

---

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer and the [Expo Go](https://expo.dev/go) app on your phone.

```bash
npm install
cp .env.example .env     # then fill it in, see below
npx expo start --clear
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

### The `.env` file

Copy `.env.example` to `.env` and fill in:

| Variable | What it is |
|---|---|
| `EXPO_PUBLIC_WORK_DOMAIN` | The email domain colleagues verify with, for example `example.com`. |
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The project's anon or publishable key. |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | A Mapbox public token (starts with `pk.`), for map tiles, search and routes. |
| `EXPO_PUBLIC_BACKEND` | Optional. Set to `local` to run with no server at all (see below). |

All of these are public by design: they end up inside the app. Row level security in the database is what protects the data. **Never put a Supabase service role key in this file.**

`.env` is git ignored. After changing it, restart with `npx expo start --clear`, because the values are baked in when the bundle is built.

### Try it with no server

Set `EXPO_PUBLIC_BACKEND=local` and the app keeps everything in a small SQLite database on the phone. The sign in screen becomes a list of test accounts: create a driver and a rider, and switch between them with one tap to try both sides of a ride. Remove the line to go back to Supabase.

---

## Build an Android APK

Builds run on Expo's servers with [EAS Build](https://docs.expo.dev/build/introduction/).

```bash
npx eas-cli login                                      # once
npx eas-cli build --platform android --profile preview
```

The `preview` profile in `eas.json` produces an `.apk` you can install directly. When the build finishes, EAS prints a link and a QR code to download it.

Your local `.env` is uploaded with the build (see `.easignore`), so the APK talks to the same backend you run locally. It is never committed to git.

---

## Project layout

```
src/
  app/                 Screens. Each file is a route (Expo Router).
    (auth)/            Sign in, work email code, first profile.
    index.tsx          Home: the map with a sheet of rides.
    post.tsx           Offer a ride (drivers).
    find.tsx           Where you get off (search).
    trip/[id].tsx      One ride: route, driver, take a seat.
    pickup/[id].tsx    The driver's pickup and drop off screens.
    chat/[id].tsx      Messages for one ride.
    you.tsx            Account.
    onboarding.tsx     The intro, replayed from Account.
  data/
    session.tsx        Who is signed in, and are they a colleague.
    store.tsx          Rides, people, matching, seats.
    backend/           One interface, two backends: supabase.ts and local.ts.
  lib/                 Mapbox, place search, routes, time, config.
  theme/               Colours, type, spacing, light and dark.
  ui/                  Shared pieces: map, dialog, sheet, buttons, icons.
```

### How matching works

A ride is the pickup point plus where the driver is going. The real driving road between them comes from Mapbox Directions. A rider is matched when their drop off is within about 1.5 km of that road, and drop offs are ordered by how far along the road they are.

### The backend

The Supabase schema (tables, row level security, functions) and the edge function that emails work codes are kept outside this repository. The app expects a `corridor` schema exposed through the Supabase API. To run without them, use the local backend above.

---

## Scripts

| Command | Does |
|---|---|
| `npx expo start --clear` | Start the dev server. |
| `npx tsc --noEmit` | Type check. |
| `npx expo export --platform android` | Check the app bundles. |
