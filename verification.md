# Verification

62 automated browser checks passed in Microsoft Edge (headless), using isolated browser storage and blocked external requests. No production tournament data was modified.

## Finals and branding

- PASS: Public navigation offers Matches, Teams, Standings and Finals without admin sections
- PASS: All nine menu sections display only their relevant panel
- PASS: All regular game choices remain available and shift selectors offer only two shifts
- PASS: Finals require every bowler and team to complete all seven regular matches
- PASS: Overall tenth-place tie waits for an explicit rollout selection
- PASS: Elimination uses one new handicap game, resolves fifth-place tie, and opens 5th versus 4th
- PASS: Admin can record a winner without scores and advance to seed 3
- PASS: Stepladder carries handicap through every game and declares a champion
- PASS: Correcting an early winner clears all dependent later matches and the champion
- PASS: Senior men/women qualify together; all women qualify for the women’s final; fields reduce 10→5 and 6→3
- PASS: First place in each shift is seeded; the next 16 teams pair 1–16 through 8–9
- PASS: Saving one Baker match preserves unsaved inputs in other matches
- PASS: Eight Baker winners reseed by their scores and pair 1–8 through 4–5
- PASS: Four Baker survivors join the two seeds; last-six format remains pending without an invented champion
- PASS: Tied Baker scores require a rollout winner and do not save an unresolved tie
- PASS: Editing an earlier Baker result clears dependent rounds and the last-six list
- PASS: Tied Baker reseeding requires distinct admin selections before generating the next round
- PASS: Public users see the last six and all published results; direct admin actions are blocked
- PASS: Finals survive saving and offline reload
- PASS: Changed regular scores mark finals stale and block further advancement until regeneration
- PASS: Legacy third-shift data can be moved without deleting scores
- PASS: Menu, finals, scoring instructions and event names support Spanish
- PASS: Every section and finals event fits phone, tablet and desktop widths
- PASS: New logo and icon assets are present and the updated service worker caches every app file
- PASS: Finals module and branding load offline
- PASS: No uncaught JavaScript errors in the finals browser checks

## Existing features

- PASS: Audit user sees only public menu sections; direct activation of Calcutta is blocked
- PASS: Incorrect password does not grant admin access
- PASS: Admin login submits with Enter
- PASS: Install app button provides browser-specific installation instructions
- PASS: Each of nine admin menu sections displays exactly its own panel
- PASS: Calcutta lists all teams and bowlers across shifts in three groups
- PASS: Purchase Save and Edit persist cost, buyer, and amount paid
- PASS: Invalid overpayment is rejected and Cancel restores saved fields
- PASS: Five dynamic percentage fields and category payout rate save correctly
- PASS: Only the three Sunday games count, handicap is included, four-way ties split occupied prizes equally
- PASS: Ties crossing the last paid place share its winnings without a tiebreaker
- PASS: Incomplete Sunday results are marked provisional
- PASS: Invalid place allocations are rejected
- PASS: Balance export downloads buyer totals and remaining debt
- PASS: Calcutta payout export downloads successfully
- PASS: All six existing standings export buttons download
- PASS: Spanish labels are Partidas, Calcutta, and Premiacion Calcutta
- PASS: Random Scores and Save All save the selected shift without reading hidden fields
- PASS: Individual Save rejects empty score fields
- PASS: Saved Calcutta data survives reload while offline
- PASS: Clear form and Register Team buttons work
- PASS: Edit Team and Update Team Info buttons work
- PASS: Remove Team button works on isolated test data
- PASS: Reset All Data clears tournament and Calcutta state
- PASS: Generate Dummy Teams button works
- PASS: Generate Matchups creates matches
- PASS: Individual Save Match and floating Save All buttons work
- PASS: Individual and team standings toggle buttons work
- PASS: Game and shift XLS export button downloads
- PASS: Full tournament JSON export downloads a valid backup
- PASS: Upload Tournament restores Calcutta sales and purse settings
- PASS: Retry sync retains local state when the network is unavailable
- PASS: Phone and tablet layouts contain wide tables without overflowing the page
- PASS: Service worker installs and caches all eleven app-shell assets
- PASS: Installed app shell reloads offline
- PASS: No uncaught JavaScript errors throughout browser checks

Responsive checks cover every section at phone, tablet and desktop widths. All required application assets are cached and the app reloads offline. Physical-device installation, live cloud synchronization and remote database policies remain deployment checks.
