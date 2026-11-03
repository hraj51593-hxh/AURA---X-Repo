# AURA-X — implementation plan

## Scope and delivery
Build a new, published AURA-X Personal Goal OS website using the supplied source archives and product brief as the reference. The new site has its own managed server/database; prior test accounts are not required. Do not alter any legacy site or claim that old records have been migrated. Preserve working AURA-X branding and functionality rather than substituting a generic mockup. Publish only after source checks and deployment verification. The deliverable is the live website, not a ZIP. A native Android/iOS binary is outside this website scope.

## Implementation approach
1. Use `code(9).zip` as the primary source snapshot because it includes the first-goal intake component absent from `code(8).zip`. Retain helpful documentation/reference evidence from `code(8).zip`, but do not copy its project identity, initializer metadata, generated bindings, or legacy deployment state into the new project.
2. Preserve the existing React 19 + TypeScript + Vite + Wouter frontend and React Query/tRPC client, Express/tRPC/Zod/SuperJSON backend, Drizzle/MySQL schema and migrations, authentication, AURA-X flows and PWA assets. Merge rather than overwrite managed WebDev project/runtime files and its canonical Git binding.
3. Keep the new managed database isolated. Use versioned, additive migrations only; do not reset or delete records. All private records and agent actions must be scoped to the signed-in owner.
4. Keep first-goal onboarding editable, typed-or-spoken and explicitly confirmed. Replace the compact modal with a dedicated `/goals/new` full-page, step-by-step form; preserve data between steps, show progress, provide Back/Continue/Cancel and a discard confirmation, make the goal description spacious, and submit through the existing creation/roadmap APIs. Include Today, Tomorrow and a future date picker; persist the selected calendar date and align the target/task offsets to it. Support goal durations through 730 days. After save, open the new workspace and retain the honest roadmap retry path.
5. Complete Auri's event-driven reactions, contextual feedback, route presence, movement and facial expressions, reduced-motion and touch/mobile behavior, guided by the user video and existing mascot implementation. Do not automatically reposition or follow cursor/scroll/focus; leave the mascot stationary at its default or user-set position, preserve scrolling, and allow an intentional manual drag that remains placed across routes.
6. Complete user-initiated Hindi/English/Hinglish voice sessions with transcript editing, session controls, agent integration, actual spoken replies and Auto language matching. Use browser dictation where available; in supported HTTPS webviews use a microphone-permissioned, maximum-30-second MediaRecorder fallback with explicit Finish-to-transcribe, protected managed transcription and no raw-audio persistence. Prefer a matching installed device voice; optional hosted TTS uses a protected server-only key and a standard, non-cloned voice. Never clone or impersonate a voice without explicit authorization and provider consent requirements.
7. Verify provider-backed resources, saved/reviewed status, filters, errors and partial results. Use real URLs/metadata only; unsupported resource categories must be disclosed rather than fabricated.
8. Preserve learning checks and goal-scoped Auri capabilities. Auri may perform only allowlisted, authenticated AURA-X actions; consequential schedule changes remain proposals. Public-web search is not unrestricted access to a private browser or computer.
9. Derive a complete chronological attendance date list from the persisted goal start date and duration (up to 730 days), display date, weekday and attended/missed/not-checked-in status, and add a date picker bounded to the goal's start date and latest editable day. Let the owner choose any past/current date and mark Present/Attended, Missed, or clear the mark; allow quick date selection from the list. Unmarked days remain neutral, not missed, and future dates stay unavailable for check-in. Retain owner-scoped records and uniqueness rules, plus an additive nullable start-date migration with a safe startedAt/createdAt fallback for existing goals.
10. Preserve and improve responsive layouts, light/dark mode, accessibility and installable PWA behavior. Configure optional services only when available; do not claim integrations or automation are active until verified.
11. Run TypeScript checks, tests, production build, health and route-manifest checks before checkpoint/publish. Report provider requirements/costs, limitations, tests and the actual confirmed live URL.

## Project structure
- `client/src/App.tsx`: application routes, providers and global error boundary.
- `client/src/pages/Home.tsx`: public entry, authentication, dashboard, goals, resources and learning interface.
- `client/src/components/`: existing AURA-X layout, Auri face/mascot, onboarding and chat components.
- `client/src/hooks/`: voice and other client behavior.
- `client/src/aura*.css` and `client/src/index.css`: established AURA-X styling and responsive/accessibility rules.
- `server/routers.ts`, `server/routers/*.ts`: authenticated API routes, ownership checks and feature procedures.
- `server/services/`: Auri agent, roadmap/assessment AI, resource search and optional TTS integrations.
- `drizzle/schema.ts` and `drizzle/`: user-owned product data and additive SQL migrations.
- `shared/`: shared types/validation; `docs/`: setup and provider boundaries; `client/public/`: PWA and static route artifacts.

## Design direction
- **Movement:** calm, responsive product design based on the supplied AURA-X interface and Auri interaction video.
- **Principles:** guided, warm, specific and trustworthy.
- **Color:** preserve the source brand palette; use color for actions and meaningful status feedback.
- **Layout:** retain the existing goal-workspace/navigation hierarchy and keep Auri near the active area without blocking content; on small screens respect safe areas and controls.
- **Signature elements:** original animated SVG mascot, contextual speech bubble, goal progress and next-action cues.
- **Interaction:** purposeful and user-controlled; automatic reactions reflect actual app events, not random mood changes. Voice capture begins only after the user starts it; Auri's position changes only when the user deliberately drags it.
- **Motion:** preserve subtle float/blink and expression/gesture transitions; never chase the cursor or scroll events. Use a clear touch-friendly drag handle and respect reduced-motion.
- **Typography:** keep the established AURA-X type system and readable Hindi/English sizing.
- **Brand voice:** supportive, practical and nonjudgmental; Auri explains real next steps and never claims a tool action succeeded before confirmation.
- **Brand essence:** a practical personal goal coach that turns ambitions into accountable next actions; warm, steady, dependable.
