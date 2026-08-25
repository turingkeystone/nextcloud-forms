<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Video recording questions

This Forms fork adds a single-answer `video` question to Forms 5.3.5. It supports authenticated and public-link submissions, browser recording, selecting an existing video, post-recording preview, resumable-style chunk transfer, and inline result playback.

## Browser behavior

- The initial camera request prefers `facingMode: environment`; the browser decides which physical lens is the rear main camera. Respondents can select or cycle through the cameras reported by `enumerateDevices()`.
- The default is 1920×1080, landscape, 30 fps, with microphone audio. Creators can require landscape, require portrait, or allow either orientation; landscape is the compatibility default. Opening the camera immediately enters the fullscreen recorder in either orientation. A mismatched orientation shows a blocking warning until the respondent rotates the device. A denied or unavailable microphone produces an explicit warning and enables silent recording.
- 720p, 1080p, QHD 2560×1440 (shown as 2K), and UHD 3840×2160 (4K) are offered as ideal camera constraints. The browser and camera choose the closest actual output, which is displayed over the preview. Recording is not rejected when an exact resolution cannot be applied.
- Recording formats are detected with the standard `MediaRecorder.isTypeSupported()` capability API. Every detected codec group plus the unconstrained browser default is shown; MP4/H.264/AAC is selected first when supported. As in `RecordingMobile.vue`, the detected MIME variant selected in the interface is passed unchanged to `MediaRecorder`; if no explicit MP4/H.264/AAC variant is detected, the unconstrained browser default remains available.
- The active recording remains browser-backed until it is stopped, matching the mobile reference implementation. `MediaRecorder` emits a bounded chunk every second, as in WebKit's official Safari example, so long recordings do not depend on the browser's internal single-Blob buffer size. No storage quota estimate or persistent-browser-storage gate is used.
- Recording duration is configurable from 1 through 120 minutes and defaults to 120 minutes. One completed video can be submitted. The hard client and server size limit remains 16 GiB, so high-bitrate recordings can reach the size limit before two hours.
- Recording stops before upload. The recorder automatically switches the same video element from its live `MediaStream` to the complete local Blob URL, unmutes it, and enables native playback controls. The respondent can then record again or confirm an upload; recording again immediately restores the fullscreen camera view. Recording and preview intentionally follow `SkillAssessmentWeb/src/components/RecordingMobile.vue` without additional media pipelines: `onstop` builds one plain Blob directly from the emitted chunks using `MediaRecorder.mimeType` (or `video/webm` when empty) and creates one object URL. Playback does not rewrite the MIME type, attach a Blob through `srcObject`, inspect MP4 boxes, or use MediaSource. A separate File wrapper is retained only for the Nextcloud upload API. No MD5 is calculated and no transcoding is performed.
- Fullscreen recorder actions use icon-only buttons with translated accessible names. They are arranged vertically at the right edge in landscape and horizontally along the bottom in portrait. Actions outside the fullscreen camera use both icons and translated visible labels. When element fullscreen is unavailable (notably in iOS Safari), the active recorder is teleported to a fixed document-body overlay so Nextcloud's header, footer, transformed containers, and overflow rules cannot cover or clip it. Safari's own browser chrome remains under browser control.
- A required video question is incomplete until exactly one video has finished uploading and the browser holds both server-issued upload credentials. Client validation blocks submission before upload, while server validation independently verifies the credentials and file ownership.
- Forms page responses add only `blob:` to the `media-src` Content Security Policy directive so the browser may load those local preview URLs. Script, connection, frame, object, and all other CSP directives retain Nextcloud's defaults; embedded forms additionally retain their existing frame-ancestor policy.

The browser does not restore an interrupted recording after reload.

## Server upload flow

The API creates a high-entropy upload session and accepts sequential 8 MiB chunks. Mobile clients send each chunk as a standard multipart POST and report the browser's per-request transfer progress; the legacy raw PUT endpoint remains available. Each temporary upload is streamed into app data and checked against its exact range; retries are idempotent. Completion validates the chunk set, then streams it into the form owner's temporary Forms folder. Peak PHP userspace buffering is bounded to one multipart chunk and the stream implementation rather than the video size.

Session creation is rate-limited separately for anonymous IP addresses and authenticated users. Chunk, status, completion, and cancellation requests require the separate 48-character capability token; knowing or guessing a form ID is not sufficient.

Sessions expire after two hours. `CleanupVideoUploadSessionsJob` runs every 15 minutes and removes at most 100 expired sessions per run. Completed but unsubmitted videos continue to use the existing one-hour `CleanupUploadedFilesJob` lifecycle.

Because completion copies and scans the assembled object, the reverse proxy and PHP request timeout must cover the largest expected video. The request-body limit only needs to exceed one chunk plus headers; 16 MiB is sufficient for the fixed 8 MiB chunks. Server storage must temporarily accommodate both the chunk set and the completed file.

## Antivirus policy

The final write goes through Nextcloud storage, so Files Antivirus scans it when that app is enabled. A positively infected upload is deleted by Files Antivirus and Forms rejects completion. Scan-unavailable, timeout, size-limit, and otherwise-unscannable outcomes must be fail-open, as required for large videos.

Files Antivirus is a global storage wrapper and does not expose a safe per-app bypass. Set its global policy accordingly on the real deployment:

```console
occ config:app:set files_antivirus av_block_unreachable --value=false --type=boolean
occ config:app:set files_antivirus av_block_unscannable --value=false --type=boolean
occ config:app:set files_antivirus av_infected_action --value=delete
```

`av_block_unreachable` defaults to true upstream, so the first command is required. The last command also deletes malware found later by a background scan. These settings should be verified after every Files Antivirus configuration migration.

## Result access

Results render an HTML video player and a download action. Media is served only after the same result/submission authorization checks as the Forms result API. The endpoint implements one HTTP byte range at a time and emits the file in 1 MiB pieces, so seeking and playback do not load the entire object into PHP memory.

## Validation

Use the normal Forms checks plus the frontend capability test:

```console
npm run test:unit:frontend
npm run lint
npm run stylelint
npm run build
composer lint
composer cs:check
composer test:unit
composer psalm
```

The PHP commands require a Nextcloud-compatible PHP and Composer environment. The Playwright server helper uses containers and is not part of validation in container-restricted development environments.
