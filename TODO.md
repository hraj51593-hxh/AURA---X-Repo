# AURA-X — implementation outcomes

Status applies to the newly initialized project. The AURA-X source is imported; mark outcomes complete only with evidence from this project.

## 1. Preserve AURA-X as a new working website
- [x] Import the supplied AURA-X source while preserving the new project's WebDev binding, Git repository, managed runtime/database configuration, generated runtime files and dependency setup. Do not copy project identity/initializer metadata from either source archive.
- [x] Keep the established React/TypeScript/Vite, Express/tRPC, Drizzle/MySQL architecture and existing authentication, goals, roadmaps, tasks, attendance, progress, learning, resources, chat, settings, styles and PWA assets; do not replace it with a mockup or chat-only site.
- [x] Use this new project's own database. No migration of prior test accounts/data is needed. Do not reset/delete records and do not modify any legacy website. The project tables and latest resource schema were created in the newly provisioned database.
- [x] The requested deliverable is the live website; do not produce a ZIP. Do not represent a native Android/iOS binary as included in this website scope. Publication remains pending.

## 2. Public entry, authentication and data ownership
- [ ] Public visitors can understand AURA-X and Auri before creating an account; the public page does not expose private user data.
- [ ] Email/password sign-up, login and logout, persistent secure sessions and authentication errors work. Only signed-in users access private workspaces.
- [ ] Every private goal, task, milestone, progress record, assessment, resource, conversation and saved preference is checked against the authenticated account on the server. API keys stay server-side; no development bypass, fake signed-in user or exposed secret is allowed.

## 3. First-goal onboarding and confirmed creation
- [ ] When an authenticated user has no goals, Auri proactively offers first-goal guidance.
- [ ] Intake asks what the user wants to achieve; current skill/experience, prior attempts, available daily/weekly time, target deadline/duration, learning preferences, relevant budget, constraints/challenges, and measurable success criteria. Answers can be typed or spoken.
- [ ] Auri summarizes answers into an editable, reviewable draft and opens the existing goal flow prefilled. Do not save any goal until the user explicitly confirms.
- [ ] Clicking Build Goal/Create Goal opens a dedicated `/goals/new` full-page workflow, not a transparent/blurred modal; do not show the previous page behind it. Preserve AURA-X branding, colors, typography and light/dark theme. Keep it responsive and roomy with clear labels, helpful placeholders, a large multiline goal-description field and sufficient spacing.
- [ ] Present goal entry step by step with a progress indicator (for example “Step 1 of 4”); keep values when moving Back/Continue. Include title and description; category and starting level; duration and desired start date; time/preferences; and review/roadmap generation. Validate required fields before continuing. Provide Back, Continue, Cancel, and a confirmation before discarding entered data. Final confirmation saves through the existing API. On success, open the created goal workspace; on AI failure keep the saved draft and show a retry path.
- [ ] Ask “When would you like to start your goal?” and offer Start today, Start tomorrow, and a date picker for another future date. Persist that selected calendar date with the goal and align its target date/task offsets. Support the user's requested goal durations, including 10, 20, 30, 60, 100, 180, 365 and 730 days.

## 4. Persisted dashboard and goal execution
- [ ] Dashboard values come from the current user's persisted records: active goals, upcoming/completed tasks, milestone progress, recent activity, attendance/consistency, progress indicators, Auri guidance and recommended next actions.
- [ ] Users can create/edit/view goals; review roadmaps; track milestones; complete/update tasks; record progress/reflections; adjust deadlines; pause/resume goals; and archive completed goals.
- [ ] Roadmaps contain goal-specific milestones; deadline-aware daily/weekly tasks; priorities; completion criteria; estimated effort; relevant resources; and assessment checkpoints. AI-generated schedule changes are proposals for user review, never silently applied.
- [ ] Attendance covers exactly the full goal duration from its selected start date through the final day (e.g., 10-day = 10 entries; 20-day = 20; 30-day = 30; 60-day = 60; up to 730 days). Display every entry chronologically with calendar date, weekday, and status: not checked in, attended, missed, or visibly upcoming. Unmarked days are neutral and are never inferred to be missed. Long calendars remain readable in a scrollable responsive list on mobile and desktop.
- [ ] Replace the today-only “I showed up today / missed today” controls with an accessible date picker bounded by this goal's start date and the current day (or its final date if already ended). Let the user choose any past/current date and mark it Present/Attended, Missed, or clear a wrong mark back to not checked in; also allow quick selection from the chronological date list. Do not allow future check-ins, duplicate user/goal/date rows, or automatic missed statuses. Persist corrections under the authenticated owner and retain them after refresh/reopen. Existing goals without a new startDate use a safe startedAt/createdAt fallback; never reset or delete existing data.

## 5. Goal-scoped Auri AI agent
- [ ] Auri understands natural-language instructions, responds in the user's language, maintains relevant conversation context, understands the selected goal/task, asks clarifying questions when needed, explains recommendations and suggests next actions.
- [ ] Auri grounds web answers in real public-web/provider results and returns verifiable source names/URLs where available. Public web search does not imply access to a user's private logged-in browser, computer or other apps.
- [ ] Auri executes only supported, explicitly requested AURA-X actions: real resource search/save, learning-check creation, allowed goal edits, user-reported task progress and schedule proposals. It confirms success only after the backend confirms success; consequential changes require review/confirmation.
- [ ] Preserve goal ownership, validated action allowlists, loading/error/retry and conversation history. Never invent unrestricted computer access or a successful action/source/capability.

## 6. Auri mascot, automatic reactions and contextual feedback
- [ ] Preserve all 23 movement states (sleeping, waking, idle, listening, thinking, searching, working, excited, bored, suspicious, angry, drowsy, happy, curious, confused, surprised, proud, shy, sad, laughing, scared, playful, celebrate), all 27 facial expression presets and existing SVG/PNG/JSON export.
- [ ] Presets are not production user-facing manual selectors; Auri automatically chooses expression/movement from real application events and user interactions.
- [ ] React to route, voice/listening/playback, AI thinking/working, resource search, real success/error, language and inactivity events, but never move in response to pointer position, focus, or scroll.
- [ ] Auri stays stationary where initially placed or where the user deliberately drags it; manual movement is optional, keyboard/touch accessible and does not impede scrolling or controls. Keep contextual speech bubbles, face expressions/gestures and concise real guidance/validation/success/error reactions across app routes.
- [ ] Active work/listening/voice states are not overridden by idle timers. Mascot interaction remains unobtrusive on mobile and respects reduced motion. Follow the supplied reference for face, gestures and speech-bubble behavior while preserving AURA-X's own mascot design.

## 7. User-initiated multilingual voice conversation
- [ ] A visible voice control starts capture only after the user opts in and the browser grants microphone permission. Use native browser recognition where supported; if absent, capture a short, maximum-30-second microphone clip and show an explicit Finish control before secure transcription. Stop the microphone when the turn ends; do not persist raw audio.
- [ ] Support Hindi, English and Hindi-English code-switching (Hinglish) as provider/browser capability permits, default to Auto language matching, and allow explicit English/Hindi/Hinglish choices. Send final recognized speech to the same selected-goal Auri agent, speak the actual response, and resume listening after playback only while the session is active.
- [ ] Provide Start, Pause, Resume, Interrupt current speech, Stop and Switch to text controls; editable transcripts; microphone/playback states; actionable errors and retry.
- [ ] Use the best matching installed device voice by default; optional hosted server TTS uses protected credentials and a standard, non-cloned voice. The rejected optional TTS key was withdrawn; this build must gracefully use device speech. Voice selection/cloning requires an authorized voice and explicit consent/verification; never clone arbitrary third-party, movie or celebrity voices without permission or promise a perfect clone.
- [ ] Disclose provider and project-credit limits; do not claim permanent free AI or always-on hosting.

## 8. Real goal-related resources
- [ ] Search selected goal/task context and an optional user topic through YouTube Search and playlist candidates via Manus API Hub; Open Library; Crossref; Wikipedia; Internet Archive; Library of Congress; OpenAlex; Europe PMC for biomedical goals; arXiv for STEM goals; GitHub and Stack Exchange for technical goals; Hugging Face for AI/data goals; and optional Brave Search only when configured. Return real videos, books, papers, articles, documentation/tutorials, datasets, technical projects and community practice; treat playlists only as course candidates, never as verified/accredited courses.
- [ ] Validate HTTPS URLs, label providers, deduplicate and persist resources to the correct goal. Never fabricate URLs, metadata, course offerings, ratings, certificates or credentials.
- [ ] Provide category and goal-scoped topic search, sorting, source/detail cards, external links, persisted bookmarks/unbookmark, saved resources, reviewed status, and loading/empty/error/retry/partial-provider states.
- [ ] Do not label ordinary articles/videos as accredited courses; disclose unsupported categories rather than showing fake results.

## 9. Learning checks and assessments
- [ ] Users can take learning checks, answer questions, receive explanations/feedback, review attempts, identify knowledge gaps and receive targeted practice recommendations.
- [ ] Save assessment results/attempts under the right user and goal. Scores are not presented as proof of professional competence or real-world mastery.

## 10. Permissioned automation and proactive goal intelligence
- [ ] Support only authorized in-app automation: goal creation through conversation, roadmap generation, task organization, real resource search/save, user-reported progress, proposed plan adjustments, authorized reminders, progress summaries and next-action recommendations.
- [ ] Expose triggers/actions/permission checks, execution history, error handling, retry and pause/cancel controls where supported; consequential actions require explicit confirmation. Never claim unavailable scheduling/automation is working.
- [ ] With user permission, detect stalled goals, overdue tasks and upcoming deadlines, recommend realistic adjustments and configurable reminders/summaries. Users can inspect, edit and delete stored preferences/context where implemented.

## 11. Responsive, accessible website and PWA
- [ ] Preserve responsive desktop/tablet/mobile behavior, light/dark mode, accessible controls, keyboard navigation, reduced motion and the existing installable PWA behavior where supported.
- [ ] Keep microphone use user-initiated, clearly disclosed and permission-controlled. Do not claim a native mobile app unless built and verified separately.

## 12. Verification, migration safety and publication
- [ ] Run project TypeScript checks, tests and production build after integration/improvements; fix regressions and add focused coverage for changed behavior as appropriate.
- [ ] Verify unauthenticated health endpoint and complete route manifest. Validate persistence and ownership without destructive database tests or resets; development and published instances share this project's managed database.
- [ ] Create a canonical checkpoint and publish only after validation. Confirm the publish receipt and resulting URL before claiming the website is live. Preview/build/checkpoint success alone is not publication confirmation.
- [ ] Final handoff reports implemented and verified features, actual limitations, required protected API keys/provider costs, tests performed, deployment state and confirmed live URL. Do not claim 100% perfection, permanent uptime or unverified behavior.
