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

## Find my car: planned, on hold

Do not build until the owner says go (decided 2026-10-19).

- The driver turns on "Find my car" for their ride. Off by default, can be turned off any time; the driver's screen says while it is on.
- Riders booked on that ride, and only them, see the car's live position on their map, updated every few seconds, with how long ago it was.
- Works from posting until the ride ends: at the pickup and during the drive. Stops on cancel, "Everyone is dropped off", or 3 hours, whichever comes first.
- Enforced in the database (a rule letting riders on the ride read the driver's latest point), like ride_tracks. Separate from the safety recording, which stays as it is.
- Open problem: depart_trip() drops every rider not checked in. A rider the driver means to collect on the way would lose their seat and the car view. Proposed fix: a "Picking up on the way" mark on the pickup screen, so that rider keeps their seat after departure; the driver checks them in when they get in.
