# De La Rosa Masters — secure upgrade

This is a complete Cloudflare Worker project, not a replacement index.html alone. The public website lives in public/. Administrator HTML and JavaScript are bundled privately and served only after verified sign-in. Existing tournament, Calcutta and finals editor features are retained.

## Current verification
Eight automated backend tests pass. Headless Edge checks pass for public Spanish results, Enter-key sign-in, each admin menu showing one section, saving and reloading, HttpOnly session cookies, no private browser-storage cache, phone/tablet/desktop widths, logout and no uncaught JavaScript errors. These checks use a simulated Supabase service; live database migration, email delivery and Cloudflare deployment still require verification. Previous feature tests are not a substitute for live acceptance testing.

## Deployment order
1. Export a current tournament backup from the existing app and keep it outside the repository. Pause editing during migration.
2. In GitHub, make Monster-ProShop/DeLaRosaMastersv2 private and disable its old GitHub Pages site. Remove the public backup JSON from the current checkout. Previously public copies cannot be recalled.
3. Replace the repository contents with this complete project. Keep the public folder structure. Cloudflare must run `npx wrangler deploy` from the project root, using wrangler.jsonc; do not deploy the entire repository as static files. Only public/ is the asset directory.
4. In Supabase project yfpdcwhhnnucqjahoilz, Authentication > Users: create monsterproshop@outlook.com with a strong unique password and a confirmed email. Enter the password yourself; do not paste it into chat. Disable new public signups under Sign In / Providers.
5. Configure Cloudflare Worker secrets SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLISHABLE_KEY from this Supabase project's API Keys settings. Never put the service key in GitHub, public files, or chat. SUPABASE_URL, ADMIN_EMAIL and TOURNAMENT_ID are already in wrangler.jsonc.
6. When the Worker is ready to deploy, run supabase/01-secure-migration.sql in Supabase SQL Editor. It preserves the tournament row but revokes old direct browser database access, so the old site stops syncing immediately. Then run supabase/02-authorize-admin.sql to allow only your confirmed account UUID.
7. Deploy the Worker. Keep the existing masters.ilusionbowl.com custom domain attached to delarosamasters. GitHub commits to the configured production branch trigger Cloudflare's connected build; there is no need to toggle the branch to None.
8. Open /login and sign in. Verify the old tournament is present. Open the domain in a private browser window: results should work without login, /admin/ should redirect to login, and /api/admin/state should return 401.
9. Import a backup only if needed. Test on a separate tournament row before altering production scores. For an isolated testing Worker, duplicate wrangler.jsonc with a different Worker name and TOURNAMENT_ID, and configure its secrets separately. Never run destructive tests on your production row.

Optional email-code login requires working Supabase email delivery. Set the Magic Link email template to display {{ .Token }}. Supabase's default email service restricts recipients; configure custom SMTP for dependable delivery. Password sign-in is available while SMTP is being configured.

## Local commands
Install Node.js, then in this folder run:

    npm install
    npm test
    npx wrangler login
    npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
    npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
    npm run deploy

For local development put those keys in an untracked .dev.vars file and run npm run dev. The package contains no real secrets.

## Testing checklist
- Public English/Spanish results, team and individual standings, matches, finals, and mobile installation. iPhone/iPad: Safari Share > Add to Home Screen. Android: Install App prompt or browser install menu.
- Admin login by password and Enter; email code after SMTP setup; logout; expired session.
- Two shifts, registration, edits, seven matches, zero scores and ties, score corrections and exports.
- Each Calcutta category: buyer/cost/paid, Save/Edit/Cancel, debts CSV, payout percentages summing to 100% or less, Sunday ties sharing occupied places.
- Individual finals: top 10/10/6, cutoff selections, handicap elimination, 5/5/3 stepladders, winner changes resetting later rounds.
- Team finals: one shift seeds its leader and qualifies 10 others (10-to-5); two shifts seed both leaders and qualify 16 others (16-to-8-to-4). All six survivors play one new Baker game. Every Baker game uses Math.round(team handicap * 0.33). Final-game ties share a place. Regenerate legacy scratch-format team finals to apply these rules.
- Two admin windows: a stale save must be rejected rather than overwriting changes. Export edits before reloading after a conflict.

## Security boundaries
Public HTML, styles, logo and rendering JavaScript remain inspectable, as on any website. Private admin code is accessible to a signed-in administrator, and the repository must be private to hide its source. Server credentials never reach the browser. The server verifies both the Supabase account and its admin UUID on each protected request, validates regular scores/handicap and computes public standings. Admin finals and Calcutta calculations still run in the authenticated editor; this does not conceal them from an authorized administrator.

Admin requires a network connection. Sessions last at most one hour; export unsaved edits before signing in again. Public results refresh every 30 seconds. Only the public shell is cached offline, not private records or results API responses.
## Spanish, installation and score notifications

New visitors start in Spanish. An explicitly saved English/Spanish preference is retained.

On iPhone/iPad, open the site in Safari, choose Share > Add to Home Screen > Add, then open the new icon. Web Push requires iOS/iPadOS 16.4 or later and notification permission inside the installed app. Android visitors can use Install App or the browser installation menu. The app includes its tournament icon and visible installation guidance.

Visitors opt in using Activar notificaciones. A successful admin save that changes completed match scores or recorded finals scores sends the fixed message `Resultados se han actualizado!`. Repeated unchanged saves and rejected stale saves do not send. Delivery is best effort and depends on device/browser permission and connectivity. Tapping the notification opens or refreshes public Matches. Existing installations need to reopen online to receive the updated service worker and opt in.

No additional deployment secret or SQL migration is required for this feature with the existing secure schema. The Worker generates its VAPID signing key in the protected tournament_data row `push-config:<tournament id>` and keeps subscriptions in separate `push-sub:<tournament id>:<endpoint hash>` rows. These rows are accessible only through the existing service-role connection and are excluded from public results and tournament exports. The public configuration endpoint returns only the public application-server key. Expired subscriptions are deactivated. Preserve the push-config row to preserve existing device subscriptions.

Fourteen automated backend tests cover existing authorization/privacy plus VAPID signatures, subscription persistence, expired-subscription pagination, score-change detection and successful-save-only dispatch. Browser regression checks cover Spanish defaults, public menus, admin Enter login, save/reload and responsive layouts. Physical iPhone/Android notification receipt still needs a device acceptance test with an opted-in installation.
