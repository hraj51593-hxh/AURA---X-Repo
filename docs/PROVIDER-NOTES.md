# Provider and integration notes

## OpenJarvis

The supplied repository is the Apache-2.0 OpenJarvis project from Stanford. Its own README describes it as a Python 3.10+ local-first personal-AI framework, not a public hosted API. Its quickstart says `jarvis serve` can expose an OpenAI-compatible local API at `/v1/chat/completions`, plus `/v1/models` and `/health`; the example runs an Ollama model on the same host. A GitHub clone URL is therefore not a running endpoint. AURA-X will retain its working, goal-scoped agent and will not download or run unreviewed install scripts or expose an unauthenticated OpenJarvis server. A separately hosted, secured endpoint would be required for a live bridge. No OpenJarvis source code is copied into AURA-X in this change.

Sources: [OpenJarvis README](https://raw.githubusercontent.com/open-jarvis/OpenJarvis/main/README.md), [OpenJarvis quickstart](https://open-jarvis.github.io/OpenJarvis/getting-started/quickstart/), [OpenJarvis license](https://raw.githubusercontent.com/open-jarvis/OpenJarvis/main/LICENSE), [Stanford OpenJarvis overview](https://openjarvis.stanford.edu/).

## Speech

ElevenLabs' official model documentation lists Hindi and English for Eleven v4 and describes `eleven_v4_turbo` as the low-latency option for conversational agents. The standard TTS conversion endpoint accepts a voice ID and returns audio, and ElevenLabs requires a server-side API key. The user supplied voice ID `NOpBlnGInO9m6vDvFkFC`; it should remain server-selected and never appear as a credential. Until an API key is securely configured, the site should use browser speech synthesis and clearly label it as the device voice. ElevenLabs usage is subject to the user's account plan and limits, so do not claim it is free forever.

Sources: [Eleven v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4), [models and language support](https://elevenlabs.io/docs/overview/models), [TTS conversion API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [ElevenLabs quickstart](https://elevenlabs.io/docs/eleven-api/quickstart), [OpenJarvis ElevenLabs TTS backend](https://open-jarvis.github.io/OpenJarvis/api-reference/openjarvis/speech/elevenlabs_tts/).

## Goal-relevant resources

Open Library's public `https://openlibrary.org/search.json` supports book search and returns work titles, authors, publication years, and Open Library keys. Crossref's public `/works` REST endpoint returns scholarly publication metadata and DOI identifiers without sign-up. These are suitable for real book and research-paper cards; returned links must be HTTPS and clearly identify the provider. Existing YouTube Search and Wikipedia providers remain available. No verified, open course-catalog API was found in the current provider set, so AURA-X must not invent course results or label ordinary links as accredited courses.

Sources: [Open Library Search API](https://openlibrary.org/dev/docs/api/search), [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).
