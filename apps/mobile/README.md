# HydroSense mobile

The Expo workspace lives in `apps/mobile` and imports API contracts, validation,
and calculations from `packages/shared`. From the repository root, install the
workspace dependencies and run `npm run dev:mobile`. For an Android development
build, run `npm run android:mobile`; the Android SDK is required. Run
`npm run typecheck --workspace @hydrosense/mobile` and
`npm run test --workspace @hydrosense/mobile` to validate this package.
To open the app in Expo Go on a physical device, connect the phone and computer
to the same Wi-Fi network, run `npm run dev:mobile -- --go --lan --clear` and
scan the QR code from that running Expo process. If Windows Firewall blocks the
connection, allow Node.js on private networks. If the networks differ or LAN
fails, use a tunnel: from the repository root, sign in once with
`node apps\mobile\scripts\expo.cjs login`, then run
`npm run dev:mobile -- --go --tunnel`. Without logging in, use
`-- --tunnel ngrok` instead. If port 8081 is already occupied, use the QR code
printed by the current process rather than an older Expo session.
The workspace scripts configure Node's module search path so the hoisted Expo
Metro tools can resolve the mobile workspace's Expo installation. Use
`npm run export --workspace @hydrosense/mobile -- --platform android` to export
an Android bundle with the same configuration.
For a browser preview, open `http://localhost:8081` after starting Expo.
The mobile interface adapts the web app's glass palette, gradients,
branding, and reading cards to touch-friendly phone and tablet layouts. Cards
and signup dialogs use native blur with a solid reduced-transparency fallback;
authentication cards blur the page gradient. iOS system materials can look
different from CSS blur. The native navigation menus and critical alert retain
solid surfaces because Android modal windows cannot blur the underlying screen.
The
authenticated background covers the window behind the header and navigation,
and changes with the account role and appearance. The native system background
uses the appearance's canvas color while the image is loading. Rebuild native
development builds after adding the system UI module.
Appearance is available in My profile and Settings. Choose System,
Light or Dark; the preference is saved on the device and System follows its
current color scheme. The preference remains after signing out.
The dashboard header offers role-filtered navigation and alert access. Tank
selection and connection status are in the account menu. The indicator reports a live connection
or a recent reading; a recent reading alone does not imply a WebSocket stream.
The hatchery selector combines locations reported by the tank API with Sagay
and Benoni. Empty locations show no data; administrators can share filtered
activity records as CSV.

The default is API mode, using the deployed Supabase API and publishable key
also configured in the web app. Mobile sign-in and account requests use the
backend's `/v1/auth/signin` and `/v1/auth/signup` routes. Account requests
remain pending until an administrator chooses an Operator, Manager or Admin
role and approves them. Configure the web app in API mode against the same
Supabase project to use the same accounts. Its default browser-only demo
accounts are not backend accounts and cannot be shared with mobile.

Copy `.env.example` in this directory to `.env.local` to override settings,
and restart Expo after changing it. For another backend set
`EXPO_PUBLIC_API_URL` to the API root (for example
`https://<project>.supabase.co/functions/v1/api`) and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to that project's publishable key. The
API root is shared by sign-in and all data requests.
`EXPO_PUBLIC_API_BASE_URL` remains supported as a legacy fallback.
The profile screen reads the signed-in user's profile through Supabase REST,
using the same row-level security as the web app. Its project URL is derived
from an API root ending in `/functions/v1/api`; set `EXPO_PUBLIC_SUPABASE_URL`
explicitly when that URL cannot be derived. Non-Supabase API backends without
this setting must provide `GET /v1/profile`.
For a local API use an address reachable from the device: `10.0.2.2` is the
Android emulator host address; a physical device needs the computer's LAN
address. Never put a service-role key or other secret in Expo public variables.
Mobile uses the API only. Remove `EXPO_PUBLIC_DATA_MODE=mock` from existing
configuration; sample monitoring mode is no longer supported.

The web signup page currently contains demo-only terms, which do not describe
backend sign-up. The mobile form shows those same terms with an explicit
warning; production terms and a backend record of consent are not implemented.
Forgot password uses the same Supabase recovery endpoint as the web app and
requires an API root ending in `/functions/v1/api`; reset links follow the
Supabase project's configured redirect settings.

The access token is stored in Expo SecureStore; user metadata and the offline
query cache are stored in AsyncStorage and cleared on sign-out or account
changes. Cached data may be stale and is not encrypted. The backend returns a
refresh token, but this mobile app does not yet refresh sessions; when an access
token expires, sign out and sign in again. Account role changes are reflected
at the next sign-in; API authorization must remain enforced server-side.
SecureStore is not available on web, so browser preview sessions and tokens are
kept in memory only and require sign-in again after a page reload. Native
notification handling is disabled in the browser preview.
Most API queries refresh every 30 seconds while active; the alert feed, badge,
and pending account requests refresh every 5 seconds in the foreground and on
resume. The badge counts open alerts plus pending requests for admins, matching
the web; it is not a per-user unread count. There is no notification read-state
store or background push delivery yet. Set `EXPO_PUBLIC_WS_URL`
only if a compatible live WebSocket service is available; the Supabase REST
function does not itself provide that stream. Notification navigation is wired
but push-token registration and delivery require backend integration.

Operators can access historical logs; validation is available to managers and
admins. Managers can view approved users in their assigned
hatchery. Admins can review requests, change non-admin roles, remove accounts,
and view audit logs.
Some web features, including audit-log filtering and export, tolerance editing,
and full reporting, remain on the web. The mobile report builder exports PDF,
CSV or XLSX with tank, date and section selections. It stops rather than
producing incomplete reports when the API reading or alert limit is reached.
The statistics section includes a chart of valid readings within thresholds in
the mobile preview and PDF. Missing measurements are shown as no data.
UI route restrictions are not a security boundary; the backend must
independently enforce every required permission.

Apply the profile manager-scope migration and deploy the updated Supabase API
function to enforce manager hatchery isolation on both direct database and API
access. The profile screen itself does not require the new API route when
using Supabase REST.
Apply the device reported-fields migration and deploy the updated API to show
hardware-reported Wi-Fi and pending-record values. Power source is
not shown because current firmware sends a fixed value rather than a measurement.
Values from older status records remain unavailable until the device reports
them again. Existing backend seed data must be reviewed separately; removing
mobile sample mode does not delete database records.
Addresses use the Philippine PSGC dataset, including region selections for
independent areas, and are saved as a readable profile address.
