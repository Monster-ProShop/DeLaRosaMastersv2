# De La Rosa Masters — branding, menu and finals update

This is the complete replacement webapp, including the earlier Calcutta features. Your existing tournament connection and admin password are preserved. No live database or hosting changes were made during development.

## Install the update

1. In the existing app, use **Export Data → Export Tournament (.json)** to keep a backup.
2. Upload **every application file in this package** to your existing website directory. Replace `index.html`, the manifest and service worker. Keep `finals.js`, `finals.css`, the logo and all icons next to `index.html`.
3. Use the same HTTPS domain and directory to retain browser storage and installation identity.
4. Close every open app window/tab, then reopen the site. The new service worker takes over once the old windows close. Refresh if necessary.
5. Android: choose **Install app** or the browser's Install / Add to Home screen option. iPhone/iPad: Safari → Share → Add to Home Screen → Open as Web App, if offered.
6. Existing installations may retain an old operating-system icon. If it does not refresh, remove the old home-screen installation and add the updated site again. Back up tournament data first.

PWA installation requires HTTPS (localhost works for development). Opening the downloaded HTML directly does not enable installation. References: [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Apple](https://support.apple.com/en-ca/guide/iphone/iphea86e5236/ios).

## Navigation and branding

The tabs are replaced by a **Go to section** dropdown and matching heading. Only the selected section is displayed. Public viewers have Matches, Registered Teams, Standings and Finals. Administrators also have Team Registration, Tournament Setup, Calcutta, Calcutta Payout and Export Data. Finals has its own event selector.

The polished supplied emblem appears in the header, login screen, finals screen, favicon and installation icons. The maskable icon has extra safe padding. `logo.png` is the full-resolution artwork. The generation prompt and tool details are in `logo-generation.md`.

The app now uses **two shifts** in registration, dummy-team generation, match setup, viewing and exports. If an older backup contains shift 3, an administrator can choose its destination (1 or 2) in Tournament Setup. Teams and matches move without erasing scores. Finals stay locked until this is resolved.

## Finals eligibility and publication

Finals can be generated only when every current team has one valid, completed match in each of rounds 1–7, with all three bowlers' scores entered. Missing matches, duplicate appearances, incomplete scores and legacy third-shift data block generation. Later games do not affect qualification.

Each event is generated separately by an administrator. Qualifiers, elimination standings, pairings, winners and champions appear in public Finals. Finals are saved with the tournament and included in full JSON backups, using the existing cloud connection when available.

Changing regular-play scores or roster data after generating an event marks it **outdated**. Further scoring is blocked until the administrator regenerates it. Regeneration requires confirmation and resets that event's finals scores and advancement decisions.

## Individual finals

| Event | Qualifying field | Elimination survivors |
|---|---:|---:|
| Individual Overall: all bowlers | Top 10 | Top 5 |
| Seniors: Male Senior + Female Senior | Top 10 | Top 5 |
| Women: Female + Female Senior | Top 6 | Top 3 |

Qualification uses the seven-game pin total including handicap. Categories come from registration, not birth dates. Bowlers may qualify for multiple events.

At tied qualification cutoffs, the app waits for an administrator to select the rollout winner(s). It does not use high game, scratch total or alphabetical order to eliminate tied bowlers. The selected qualifiers appear in the published list.

All qualifiers bowl **one new elimination game**. Enter scratch scores from 0–300; the app adds handicap. The qualifying total does not carry over. Save every elimination score before generating the stepladder. Ties affecting advancement or seed order require explicit rollout/seed selections. Each name may be selected once.

The five-player stepladder starts **5 vs 4**, then winner vs 3, winner vs 2, and winner vs 1. The women's three-player stepladder starts **3 vs 2**, then winner vs 1. Every scored individual finals game includes handicap.

For a stepladder match, enter both scratch scores or select only the winner. Unequal handicap totals determine the winner. A tie needs an explicit rollout winner. A selected winner that conflicts with entered scores is rejected. Saving creates the next match; the last winner becomes champion.

Use Edit to correct results. Correcting elimination scores resets the stepladder after confirmation. Correcting an earlier stepladder match resets its dependent later matches and champion after confirmation.

## Team finals

- First place in **shift 1** and first place in **shift 2** are seeded using the app's existing seven-game team standings rules: match points and existing team tiebreakers.
- Excluding those two seeds, the next **16 teams** in overall standings enter the Baker bracket. At least 18 teams, with teams in both shifts, are required.
- Round of 16: **1 vs 16, 2 vs 15, …, 8 vs 9**.
- Each pair bowls one Baker game shared by all three bowlers. Enter one **scratch team score (0–300)** per team. No individual or summed team handicap is added.
- The eight match winners reseed by their first Baker game score, highest first. Tied seeding scores require an explicit administrator selection of order.
- Round of 8: **1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5**, again one Baker game per team.
- The four winners join the two seeded shift winners as the **last six**. The next format remains pending. No additional matches or team champion are invented.
- Correcting an earlier Baker result resets the dependent later round and last-six list after confirmation.

## Calcutta and existing controls

Calcutta remains admin-only: teams across both shifts, Men, and Seniors + All Women; buyer/cost/amount paid; Save, Edit and Cancel; buyer balance and payout CSV exports; separate configurable purses. Calcutta payouts still use only Sunday's first three games with handicap. Tied entries divide the prizes of their occupied places. These payouts are separate from the new finals.

Registration, score entry, game generation, standings, exports and Enter-to-login remain available. Saving one match preserves unsaved inputs in other visible matches. Wide tables scroll horizontally on small screens.

## Storage and validation limits

The original client-side password system is preserved. Admin-only controls are hidden and action handlers check the role, but this is **not server-enforced privacy**: a technical user can inspect the embedded password and shared state. Private financial records require backend authentication and database access policies. Keep JSON backups private.

The app saves locally and attempts the existing whole-state cloud upsert. If sync is pending, use the existing notice and Retry sync. Coordinate edits across devices: the inherited storage design does not merge simultaneous changes. Other devices receive updated public finals after successful cloud synchronization/reload.

Tests use isolated sample data with external requests blocked. Physical Android/iOS installation, live Supabase synchronization and database policies were not tested. See `verification.md` for the browser checks.
