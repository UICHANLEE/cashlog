# Cashlog 3D pet redesign QA

## Reference

- Existing home: `/tmp/cashlog-design-audit/01-home.png`
- Existing pet tab: `/tmp/cashlog-design-audit/02-pet.png`
- Revised home: `/tmp/cashlog-3d-home-2.png`
- Revised pet stage: `/tmp/cashlog-3d-pet-stage.png`
- Revised dog state: `/tmp/cashlog-3d-dog-stage.png`

## Visual comparison

- The warm paper surface, hand-drawn type, uneven borders, coral CTA, mint/yellow accents, calendar, and daily-log layout remain recognizable.
- The former flat doodle mascots are no longer the primary pet treatment.
- The 3D companion is now the dominant first-viewport signal and remains integrated into the notebook surface rather than a separate polished app card.
- Cat and dog selector cards use matching high-quality rendered portraits.
- Calendar and empty-log appearances are intentionally small so they do not compete with financial content.

## Interaction checks

- WebGL canvas renders nonblank in the in-app browser.
- Tap/pet updates the live reaction and triggers character motion.
- Pointer movement and drag update 3D orientation; the toy ball is draggable.
- Cat/dog switching rebuilds the scene and updates the accessible label.
- Reduced-motion preference disables continuous bobbing and tail motion.
- Browser console contains no application errors.

## Findings

- P0: none.
- P1: none.
- P2: none after replacing the first procedural-only render with the final character texture layer.
- P3: Three.js increases the production JavaScript chunk above Vite's 500 kB advisory threshold. A later route-level split can defer the pet runtime.
- Residual verification gap: the selected in-app browser does not expose viewport resizing, so a 390 x 844 screenshot could not be captured in this run. Mobile media-query dimensions and overflow constraints were reviewed in code, but visual mobile QA remains to be captured.

final result: blocked
