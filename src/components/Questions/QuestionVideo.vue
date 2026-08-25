<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<Question
		v-bind="questionProps"
		:titlePlaceholder="answerType.titlePlaceholder"
		:warningInvalid="answerType.warningInvalid"
		:errorMessage="errorMessage"
		v-on="commonListeners">
		<template #actions>
			<NcActionCheckbox
				v-for="resolution in resolutionDefinitions"
				:key="resolution.value"
				:modelValue="allowedResolutions.includes(resolution.value)"
				@update:modelValue="
					toggleAllowedResolution(resolution.value, $event)
				">
				{{
					t('forms', 'Allow {resolution}', {
						resolution: resolution.label,
					})
				}}
			</NcActionCheckbox>
			<NcActionRadio
				v-for="orientation in recordingOrientationOptions"
				:key="orientation.value"
				:modelValue="recordingOrientation"
				:name="id + '_recordingOrientation'"
				:value="orientation.value"
				@update:modelValue="updateRecordingOrientation(orientation.value)">
				{{ orientation.label }}
			</NcActionRadio>
			<NcActionInput
				type="number"
				:modelValue="durationMinutes"
				:min="1"
				:max="maximumDurationMinutes"
				:label="t('forms', 'Maximum recording duration in minutes')"
				:showTrailingButton="false"
				@update:modelValue="updateDuration" />
			<NcActionCheckbox
				:modelValue="allowExistingVideo"
				@update:modelValue="updateAllowExistingVideo">
				{{ t('forms', 'Allow selecting an existing video') }}
			</NcActionCheckbox>
		</template>

		<div v-if="!readOnly" class="video-question-placeholder">
			<NcIconSvgWrapper :svg="IconVideo" :size="32" />
			<div>
				<strong>{{ t('forms', 'Video recording') }}</strong>
				<p>
					{{ recordingOrientationDescription }}
				</p>
			</div>
		</div>

		<Teleport to="body" :disabled="!immersiveTeleported">
			<div
				v-if="readOnly"
				ref="recorderShell"
				class="video-recorder"
				:class="{
					'video-recorder--immersive': immersiveMode,
					'video-recorder--native-fullscreen': nativeFullscreenActive,
					'video-recorder--portrait': isPortrait,
				}"
				role="group"
				:aria-labelledby="titleId"
				:aria-describedby="description ? descriptionId : undefined">
				<div v-if="hasUploadedValue" class="uploaded-video">
					<NcIconSvgWrapper :svg="IconVideo" />
					<span>{{ values[0].fileName }}</span>
					<NcButton
						variant="tertiary"
						:aria-label="t('forms', 'Replace video')"
						:title="t('forms', 'Replace video')"
						@click="replaceUploadedVideo">
						<template #icon>
							<NcIconSvgWrapper :svg="IconRefresh" />
						</template>
						{{ t('forms', 'Replace video') }}
					</NcButton>
				</div>

				<template v-else>
					<div v-if="previewUrl || cameraOn" class="video-stage">
						<video
							ref="video"
							autoplay
							muted
							webkit-playsinline
							playsinline />
						<div
							v-if="immersiveMode || recording || paused"
							class="recording-badge"
							:class="{
								'recording-badge--idle': !recording && !paused,
							}">
							{{
								paused
									? t('forms', 'Paused')
									: recording
										? t('forms', 'Recording')
										: t('forms', 'Ready')
							}}
						</div>
						<output
							v-if="!immersiveMode && (recording || paused)"
							class="recording-timer"
							:aria-label="t('forms', 'Recording duration')">
							{{ elapsedText }}
						</output>
						<div
							v-if="cameraOn && actualSettings"
							class="settings-badge">
							{{ actualSettings }}
						</div>
						<div
							v-if="immersiveMode && !orientationMatches"
							class="rotate-device-overlay"
							role="alert">
							{{ orientationWarning }}
						</div>
						<div
							v-if="immersiveMode && cameraOn && !previewUrl"
							class="video-side-controls">
							<output
								v-if="recording || paused"
								class="video-side-timer"
								:aria-label="t('forms', 'Recording duration')">
								{{ elapsedText }}
							</output>
							<NcButton
								v-if="devices.length > 1"
								type="button"
								:aria-label="t('forms', 'Switch camera')"
								:title="t('forms', 'Switch camera')"
								:disabled="recording || recordingBusy || paused"
								@click.stop="cycleCamera">
								<template #icon>
									<NcIconSvgWrapper :svg="IconSwitchCamera" />
								</template>
							</NcButton>
							<NcButton
								v-if="!recording && !recordingBusy && !paused"
								type="button"
								variant="primary"
								:aria-label="t('forms', 'Start recording')"
								:title="t('forms', 'Start recording')"
								:disabled="!canStartRecording"
								@click.stop="startRecording">
								<template #icon>
									<NcIconSvgWrapper :svg="IconRecord" />
								</template>
							</NcButton>
							<NcButton
								v-if="recording || paused"
								type="button"
								:aria-label="
									paused
										? t('forms', 'Continue')
										: t('forms', 'Pause')
								"
								:title="
									paused
										? t('forms', 'Continue')
										: t('forms', 'Pause')
								"
								@click.stop="togglePause">
								<template #icon>
									<NcIconSvgWrapper
										:svg="paused ? IconPlay : IconPause" />
								</template>
							</NcButton>
							<NcButton
								v-if="recording || paused"
								type="button"
								variant="error"
								:aria-label="t('forms', 'Stop recording')"
								:title="t('forms', 'Stop recording')"
								@click.stop="stopRecording">
								<template #icon>
									<NcIconSvgWrapper :svg="IconStop" />
								</template>
							</NcButton>
							<NcButton
								v-if="!recording && !recordingBusy && !paused"
								type="button"
								:aria-label="t('forms', 'Recording settings')"
								:title="t('forms', 'Recording settings')"
								@click.stop="
									showImmersiveSettings = !showImmersiveSettings
								">
								<template #icon>
									<NcIconSvgWrapper :svg="IconSettings" />
								</template>
							</NcButton>
							<NcButton
								v-if="!recording && !recordingBusy && !paused"
								type="button"
								:aria-label="t('forms', 'Close camera')"
								:title="t('forms', 'Close camera')"
								@click.stop="closeImmersiveCamera">
								<template #icon>
									<NcIconSvgWrapper :svg="IconFullscreenExit" />
								</template>
							</NcButton>
						</div>
					</div>

					<NcNoteCard
						v-if="
							!orientationMatches
							&& cameraOn
							&& !previewUrl
							&& !immersiveMode
						"
						class="video-inline-note"
						type="warning">
						{{ orientationWarning }}
					</NcNoteCard>
					<NcNoteCard
						v-if="!audioEnabled && cameraOn"
						class="video-inline-note"
						type="info">
						{{
							t(
								'forms',
								'Microphone access is unavailable. The video will be recorded without sound.',
							)
						}}
					</NcNoteCard>
					<NcNoteCard
						v-if="statusMessage"
						class="video-inline-note"
						:type="statusType">
						{{ statusMessage }}
					</NcNoteCard>

					<div
						v-if="
							cameraOn
							&& !previewUrl
							&& (!immersiveMode || showImmersiveSettings)
						"
						class="video-settings">
						<label>
							<span>{{ t('forms', 'Camera') }}</span>
							<select
								v-model="selectedDeviceId"
								:disabled="recording || recordingBusy || paused"
								@change="switchCamera">
								<option
									v-for="device in devices"
									:key="device.deviceId"
									:value="device.deviceId">
									{{ device.label || t('forms', 'Camera') }}
								</option>
							</select>
						</label>
						<label>
							<span>{{ t('forms', 'Resolution') }}</span>
							<select
								v-model="selectedResolution"
								:disabled="recording || recordingBusy || paused"
								@change="applySelection">
								<option
									v-for="resolution in supportedResolutionDefinitions"
									:key="resolution.value"
									:value="resolution.value">
									{{ resolution.label }} ·
									{{ resolution.width }}×{{ resolution.height }}
								</option>
							</select>
						</label>
						<label>
							<span>{{ t('forms', 'Frame rate') }}</span>
							<select
								v-model.number="selectedFrameRate"
								:disabled="recording || recordingBusy || paused"
								@change="applySelection">
								<option :value="30">
									{{ t('forms', '{rate} fps', { rate: 30 }) }}
								</option>
								<option v-if="supports60Fps" :value="60">
									{{ t('forms', '{rate} fps', { rate: 60 }) }}
								</option>
							</select>
						</label>
						<label>
							<span>{{ t('forms', 'Recording format') }}</span>
							<select
								v-model="selectedFormat"
								:disabled="recording || recordingBusy || paused">
								<option
									v-for="format in formats"
									:key="format.id"
									:value="format.id">
									{{ formatDisplayLabel(format) }}
								</option>
							</select>
						</label>
					</div>

					<div class="video-actions">
						<NcButton
							v-if="!cameraOn && !previewUrl"
							variant="primary"
							:aria-label="t('forms', 'Open camera')"
							:title="t('forms', 'Open camera')"
							@click="openCamera">
							<template #icon>
								<NcIconSvgWrapper :svg="IconVideo" />
							</template>
							{{ t('forms', 'Open camera') }}
						</NcButton>
						<NcButton
							v-if="
								!immersiveMode
								&& cameraOn
								&& devices.length > 1
								&& !previewUrl
							"
							:aria-label="t('forms', 'Switch camera')"
							:title="t('forms', 'Switch camera')"
							:disabled="recording || recordingBusy || paused"
							@click="cycleCamera">
							<template #icon>
								<NcIconSvgWrapper :svg="IconSwitchCamera" />
							</template>
							{{ t('forms', 'Switch camera') }}
						</NcButton>
						<NcButton
							v-if="
								!immersiveMode
								&& cameraOn
								&& !recording
								&& !recordingBusy
								&& !paused
								&& !previewUrl
							"
							variant="primary"
							:aria-label="t('forms', 'Start recording')"
							:title="t('forms', 'Start recording')"
							:disabled="!canStartRecording"
							@click="startRecording">
							<template #icon>
								<NcIconSvgWrapper :svg="IconRecord" />
							</template>
							{{ t('forms', 'Start recording') }}
						</NcButton>
						<NcButton
							v-if="!immersiveMode && (recording || paused)"
							:aria-label="
								paused ? t('forms', 'Continue') : t('forms', 'Pause')
							"
							:title="
								paused ? t('forms', 'Continue') : t('forms', 'Pause')
							"
							@click="togglePause">
							<template #icon>
								<NcIconSvgWrapper
									:svg="paused ? IconPlay : IconPause" />
							</template>
							{{
								paused ? t('forms', 'Continue') : t('forms', 'Pause')
							}}
						</NcButton>
						<NcButton
							v-if="!immersiveMode && (recording || paused)"
							variant="error"
							:aria-label="t('forms', 'Stop recording')"
							:title="t('forms', 'Stop recording')"
							@click="stopRecording">
							<template #icon>
								<NcIconSvgWrapper :svg="IconStop" />
							</template>
							{{ t('forms', 'Stop recording') }}
						</NcButton>
						<NcButton
							v-if="previewUrl && !uploading"
							:aria-label="t('forms', 'Record again')"
							:title="t('forms', 'Record again')"
							@click="discardRecording">
							<template #icon>
								<NcIconSvgWrapper :svg="IconRefresh" />
							</template>
							{{ t('forms', 'Record again') }}
						</NcButton>
						<NcButton
							v-if="previewUrl && !uploading"
							variant="primary"
							:aria-label="t('forms', 'Upload video')"
							:title="t('forms', 'Upload video')"
							@click="confirmUpload">
							<template #icon>
								<NcIconSvgWrapper :svg="IconUpload" />
							</template>
							{{ t('forms', 'Upload video') }}
						</NcButton>
						<NcButton
							v-if="uploading"
							variant="error"
							:aria-label="t('forms', 'Cancel upload')"
							:title="t('forms', 'Cancel upload')"
							@click="cancelUpload">
							<template #icon>
								<NcIconSvgWrapper :svg="IconClose" />
							</template>
							{{ t('forms', 'Cancel upload') }}
						</NcButton>
						<NcButton
							v-if="
								allowExistingVideo
								&& !recording
								&& !recordingBusy
								&& !paused
								&& !uploading
							"
							variant="tertiary"
							:aria-label="t('forms', 'Select existing video')"
							:title="t('forms', 'Select existing video')"
							@click="chooseExistingVideo">
							<template #icon>
								<NcIconSvgWrapper :svg="IconVideoFile" />
							</template>
							{{ t('forms', 'Select existing video') }}
						</NcButton>
						<input
							ref="fileInput"
							class="hidden-visually"
							type="file"
							accept="video/*"
							@change="onExistingVideoSelected" />
					</div>

					<progress v-if="uploading" :value="uploadProgress" max="100">
						{{ uploadProgress }}%
					</progress>
				</template>
			</div>
		</Teleport>

		<template #insert>
			<slot name="insert" />
		</template>
	</Question>
</template>

<script>
import IconSwitchCamera from '@material-symbols/svg-400/outlined/cameraswitch.svg?raw'
import IconClose from '@material-symbols/svg-400/outlined/close.svg?raw'
import IconRecord from '@material-symbols/svg-400/outlined/fiber_manual_record.svg?raw'
import IconFullscreenExit from '@material-symbols/svg-400/outlined/fullscreen_exit.svg?raw'
import IconPause from '@material-symbols/svg-400/outlined/pause.svg?raw'
import IconPlay from '@material-symbols/svg-400/outlined/play_arrow.svg?raw'
import IconRefresh from '@material-symbols/svg-400/outlined/refresh.svg?raw'
import IconSettings from '@material-symbols/svg-400/outlined/settings.svg?raw'
import IconStop from '@material-symbols/svg-400/outlined/stop.svg?raw'
import IconUpload from '@material-symbols/svg-400/outlined/upload.svg?raw'
import IconVideoFile from '@material-symbols/svg-400/outlined/video_file.svg?raw'
import IconVideo from '@material-symbols/svg-400/outlined/videocam.svg?raw'
import { showError } from '@nextcloud/dialogs'
import { loadState } from '@nextcloud/initial-state'
import NcActionCheckbox from '@nextcloud/vue/components/NcActionCheckbox'
import NcActionInput from '@nextcloud/vue/components/NcActionInput'
import NcActionRadio from '@nextcloud/vue/components/NcActionRadio'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import Question from './Question.vue'
import QuestionMixin from '../../mixins/QuestionMixin.js'
import {
	createRecordedVideo,
	isCompletedVideoUpload,
} from '../../services/media/RecordedVideo.js'
import {
	cleanupStaleRecordings,
	RecordingStore,
} from '../../services/media/RecordingStore.js'
import {
	BROWSER_DEFAULT_FORMAT_ID,
	calculateRecordingElapsedSeconds,
	getRecorderMimeType,
	getResolution,
	normalizeRecordingOrientation,
	pickDefaultRecorderFormat,
	pickDefaultResolution,
	probeRecorderFormats,
	recordingOrientationMatches,
	requestPreferredVideoSettings,
	startMediaRecorder,
	VIDEO_MAX_BYTES,
	VIDEO_MAX_DURATION_SECONDS,
	VIDEO_RECORDING_ORIENTATIONS,
	VIDEO_RESOLUTIONS,
} from '../../services/media/VideoCapabilities.js'
import { uploadVideo } from '../../services/upload/VideoUploadTransport.js'

const DEFAULT_DURATION_SECONDS = VIDEO_MAX_DURATION_SECONDS
const MAX_PENDING_RECORDING_WRITES = 8

export default {
	name: 'QuestionVideo',
	components: {
		NcActionCheckbox,
		NcActionInput,
		NcActionRadio,
		NcButton,
		NcIconSvgWrapper,
		NcNoteCard,
		Question,
	},

	mixins: [QuestionMixin],
	emits: ['update:values'],

	setup() {
		return {
			IconClose,
			IconFullscreenExit,
			IconPause,
			IconPlay,
			IconRecord,
			IconRefresh,
			IconSettings,
			IconStop,
			IconSwitchCamera,
			IconUpload,
			IconVideo,
			IconVideoFile,
		}
	},

	data() {
		return {
			devices: [],
			selectedDeviceId: '',
			cameraOn: false,
			stream: null,
			supportedResolutions: [],
			selectedResolution: '1080p',
			selectedFrameRate: 30,
			supports60Fps: false,
			formats: [],
			selectedFormat: '',
			audioEnabled: true,
			actualSettings: '',
			isPortrait: window.matchMedia('(orientation: portrait)').matches,
			immersiveMode: false,
			immersiveTeleported: false,
			nativeFullscreenActive: false,
			orientationTimer: null,
			showImmersiveSettings: false,
			recorder: null,
			recordingChunks: [],
			recordingStore: null,
			recordingWriteChain: null,
			recordingPendingWrites: 0,
			recordingWriteError: null,
			recording: false,
			preparingRecording: false,
			finalizing: false,
			paused: false,
			elapsedSeconds: 0,
			timer: null,
			recordingStartedAt: null,
			pausedStartedAt: null,
			totalPausedMilliseconds: 0,
			recordedBytes: 0,
			recordedBlob: null,
			recordedFile: null,
			previewUrl: '',
			uploading: false,
			uploadProgress: 0,
			uploadController: null,
			statusMessage: '',
			statusType: 'info',
			recordingFailed: false,
		}
	},

	computed: {
		resolutionDefinitions() {
			return VIDEO_RESOLUTIONS
		},

		allowedResolutions() {
			const configured = this.extraSettings.allowedResolutions
			return Array.isArray(configured) && configured.length
				? configured
				: VIDEO_RESOLUTIONS.map((resolution) => resolution.value)
		},

		supportedResolutionDefinitions() {
			return VIDEO_RESOLUTIONS.filter((resolution) =>
				this.supportedResolutions.includes(resolution.value),
			)
		},

		allowExistingVideo() {
			return this.extraSettings.allowExistingVideo !== false
		},

		recordingOrientation() {
			return normalizeRecordingOrientation(
				this.extraSettings.recordingOrientation,
			)
		},

		recordingOrientationOptions() {
			return [
				{
					value: 'landscape',
					label: t('forms', 'Require landscape recording'),
				},
				{
					value: 'portrait',
					label: t('forms', 'Require portrait recording'),
				},
				{
					value: 'any',
					label: t('forms', 'Allow either recording orientation'),
				},
			]
		},

		recordingOrientationDescription() {
			if (this.recordingOrientation === 'portrait') {
				return t(
					'forms',
					'Respondents can record one portrait video or select an existing video.',
				)
			}
			if (this.recordingOrientation === 'any') {
				return t(
					'forms',
					'Respondents can record one video in either orientation or select an existing video.',
				)
			}
			return t(
				'forms',
				'Respondents can record one landscape video or select an existing video.',
			)
		},

		orientationMatches() {
			return recordingOrientationMatches(
				this.recordingOrientation,
				this.isPortrait,
			)
		},

		orientationWarning() {
			return this.recordingOrientation === 'portrait'
				? t('forms', 'Rotate the device to portrait before recording.')
				: t('forms', 'Rotate the device to landscape before recording.')
		},

		maxDurationSeconds() {
			return Math.min(
				DEFAULT_DURATION_SECONDS,
				Math.max(
					60,
					this.extraSettings.maxRecordingDurationSeconds
						|| DEFAULT_DURATION_SECONDS,
				),
			)
		},

		durationMinutes() {
			return Math.round(this.maxDurationSeconds / 60)
		},

		maximumDurationMinutes() {
			return VIDEO_MAX_DURATION_SECONDS / 60
		},

		elapsedText() {
			const minutes = Math.floor(this.elapsedSeconds / 60)
				.toString()
				.padStart(2, '0')
			const seconds = (this.elapsedSeconds % 60).toString().padStart(2, '0')
			return `${minutes}:${seconds}`
		},

		canStartRecording() {
			return (
				this.cameraOn
				&& this.orientationMatches
				&& !!this.selectedResolution
				&& !!this.selectedFormat
				&& !this.recording
				&& !this.recordingBusy
				&& !this.paused
			)
		},

		recordingBusy() {
			return this.preparingRecording || this.finalizing
		},

		hasUploadedValue() {
			return (
				Array.isArray(this.values)
				&& this.values.length === 1
				&& isCompletedVideoUpload(this.values[0])
			)
		},
	},

	mounted() {
		window.addEventListener('orientationchange', this.updateOrientation)
		window.addEventListener('resize', this.updateOrientation)
		navigator.mediaDevices?.addEventListener?.(
			'devicechange',
			this.refreshDevices,
		)
		document.addEventListener('fullscreenchange', this.onFullscreenChange)
		cleanupStaleRecordings()
	},

	beforeUnmount() {
		window.removeEventListener('orientationchange', this.updateOrientation)
		window.removeEventListener('resize', this.updateOrientation)
		navigator.mediaDevices?.removeEventListener?.(
			'devicechange',
			this.refreshDevices,
		)
		document.removeEventListener('fullscreenchange', this.onFullscreenChange)
		this.cancelUpload()
		this.stopTimer()
		if (this.orientationTimer !== null) {
			window.clearTimeout(this.orientationTimer)
			this.orientationTimer = null
		}
		if (this.recorder && this.recorder.state !== 'inactive') {
			this.recorder.ondataavailable = null
			this.recorder.onstop = null
			this.recorder.stop()
		}
		this.closeCamera()
		this.exitImmersiveMode()
		this.revokePreviewUrl()
		this.recordingChunks = []
		this.releaseRecordingStore()
	},

	methods: {
		toggleAllowedResolution(value, allowed) {
			const resolutions = allowed
				? [...new Set([...this.allowedResolutions, value])]
				: this.allowedResolutions.filter(
						(resolution) => resolution !== value,
					)
			if (!resolutions.length) {
				showError(
					t('forms', 'At least one recording resolution must be allowed.'),
				)
				return
			}
			this.onExtraSettingsChange({ allowedResolutions: resolutions })
		},

		updateDuration(value) {
			const minutes = Math.min(
				this.maximumDurationMinutes,
				Math.max(1, Number.parseInt(value) || this.maximumDurationMinutes),
			)
			this.onExtraSettingsChange({ maxRecordingDurationSeconds: minutes * 60 })
		},

		updateAllowExistingVideo(value) {
			this.onExtraSettingsChange({ allowExistingVideo: value })
		},

		updateRecordingOrientation(value) {
			if (VIDEO_RECORDING_ORIENTATIONS.includes(value)) {
				this.onExtraSettingsChange({ recordingOrientation: value })
			}
		},

		updateOrientation() {
			if (this.orientationTimer !== null) {
				window.clearTimeout(this.orientationTimer)
			}
			// Let Safari finish its visual viewport update before changing the
			// fixed-position recorder. Otherwise touch hit testing can retain the
			// pre-rotation coordinates.
			this.orientationTimer = window.setTimeout(async () => {
				this.orientationTimer = null
				this.isPortrait = window.matchMedia(
					'(orientation: portrait)',
				).matches
				if (!this.cameraOn || this.previewUrl || this.immersiveMode) {
					return
				}
				await this.enterImmersiveMode()
			}, 350)
		},

		async enterImmersiveMode() {
			this.immersiveMode = true
			this.showImmersiveSettings = false
			if (this.nativeFullscreenActive || this.immersiveTeleported) {
				return
			}
			const shell = this.$refs.recorderShell
			if (
				document.fullscreenEnabled
				&& shell?.requestFullscreen
				&& !document.fullscreenElement
			) {
				try {
					await shell.requestFullscreen()
					this.nativeFullscreenActive =
						document.fullscreenElement === shell
					if (this.nativeFullscreenActive) {
						return
					}
				} catch {
					// Fall through to the document-body overlay used on iOS Safari.
				}
			}
			// A fixed element can still be clipped by transformed or scrolling
			// Nextcloud ancestors. Teleport it out of the form only when native
			// fullscreen is unavailable or rejected.
			this.immersiveTeleported = true
		},

		async exitImmersiveMode() {
			this.immersiveMode = false
			this.immersiveTeleported = false
			this.showImmersiveSettings = false
			if (
				this.nativeFullscreenActive
				&& document.fullscreenElement
				&& document.exitFullscreen
			) {
				await document.exitFullscreen().catch(() => {})
			}
			this.nativeFullscreenActive = false
		},

		onFullscreenChange() {
			if (this.nativeFullscreenActive && !document.fullscreenElement) {
				this.nativeFullscreenActive = false
				this.immersiveMode = false
				this.immersiveTeleported = false
				this.showImmersiveSettings = false
			}
		},

		async refreshDevices() {
			if (!navigator.mediaDevices?.enumerateDevices) {
				return
			}
			const devices = await navigator.mediaDevices.enumerateDevices()
			this.devices = devices.filter((device) => device.kind === 'videoinput')
		},

		buildVideoConstraints() {
			const preferred =
				getResolution(this.selectedResolution) || getResolution('1080p')
			const supportsResizeMode =
				navigator.mediaDevices?.getSupportedConstraints?.().resizeMode
				=== true
			return {
				...(this.selectedDeviceId
					? { deviceId: { exact: this.selectedDeviceId } }
					: { facingMode: { ideal: 'environment' } }),

				width: { ideal: preferred.width },
				height: { ideal: preferred.height },
				frameRate: { ideal: 30, max: 60 },
				...(supportsResizeMode ? { resizeMode: { ideal: 'none' } } : {}),
			}
		},

		async openCamera() {
			this.statusMessage = ''
			if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
				this.showStatus(
					t(
						'forms',
						'Camera recording requires HTTPS and a supported browser.',
					),
					'error',
				)
				return
			}

			// Start the fullscreen request while this click still has transient
			// user activation. Browsers may reject requests made after getUserMedia.
			const immersiveRequest = this.enterImmersiveMode()
			this.closeCamera()
			try {
				try {
					this.stream = await navigator.mediaDevices.getUserMedia({
						video: this.buildVideoConstraints(),
						audio: true,
					})
					this.audioEnabled = true
				} catch {
					this.stream = await navigator.mediaDevices.getUserMedia({
						video: this.buildVideoConstraints(),
						audio: false,
					})
					this.audioEnabled = false
				}

				this.cameraOn = true
				await this.refreshDevices()
				const track = this.stream.getVideoTracks()[0]
				this.selectedDeviceId =
					track.getSettings().deviceId || this.selectedDeviceId
				await this.configureCamera()
				await this.$nextTick()
				this.prepareCameraElement()
				await this.$refs.video?.play().catch(() => {})
				await immersiveRequest
			} catch (error) {
				await immersiveRequest
				this.closeCamera()
				await this.exitImmersiveMode()
				this.showStatus(
					t('forms', 'Could not access the camera: {message}', {
						message: error.message,
					}),
					'error',
				)
			}
		},

		async configureCamera() {
			const track = this.stream?.getVideoTracks()[0]
			if (!track) {
				return
			}
			this.selectedFrameRate = 30
			this.supportedResolutions = [...this.allowedResolutions]
			this.selectedResolution = pickDefaultResolution(
				this.supportedResolutions,
				this.extraSettings.defaultResolution || '1080p',
			)
			this.supports60Fps = false
			await requestPreferredVideoSettings(
				track,
				this.selectedResolution,
				this.selectedFrameRate,
			)
			await this.refreshFormats()
			this.updateActualSettings()
			this.statusMessage = ''
		},

		async refreshFormats() {
			this.formats = await probeRecorderFormats()
			this.selectedFormat = pickDefaultRecorderFormat(this.formats)
		},

		formatDisplayLabel(format) {
			if (format.id !== BROWSER_DEFAULT_FORMAT_ID) {
				return t('forms', format.label)
			}
			const label = t('forms', 'Browser default')
			return format.detectedMimeType
				? `${label} · ${format.detectedMimeType}`
				: label
		},

		async applySelection() {
			const track = this.stream?.getVideoTracks()[0]
			if (!track) {
				return
			}
			await requestPreferredVideoSettings(
				track,
				this.selectedResolution,
				this.selectedFrameRate,
			)
			this.updateActualSettings()
			this.statusMessage = ''
		},

		updateActualSettings() {
			const settings = this.stream?.getVideoTracks()[0]?.getSettings()
			this.actualSettings =
				settings?.width && settings?.height
					? t('forms', '{width}×{height} · {rate} fps', {
							width: settings.width,
							height: settings.height,
							rate: Math.round(settings.frameRate || 0),
						})
					: ''
		},

		async switchCamera() {
			await this.openCamera()
		},

		async cycleCamera() {
			const index = this.devices.findIndex(
				(device) => device.deviceId === this.selectedDeviceId,
			)
			const next = this.devices[(index + 1) % this.devices.length]
			if (next) {
				this.selectedDeviceId = next.deviceId
				await this.switchCamera()
			}
		},

		async closeImmersiveCamera() {
			this.closeCamera()
			await this.exitImmersiveMode()
		},

		closeCamera() {
			this.stream?.getTracks().forEach((track) => track.stop())
			this.stream = null
			this.cameraOn = false
			this.actualSettings = ''
			if (this.$refs.video && 'srcObject' in this.$refs.video) {
				try {
					this.$refs.video.srcObject = null
				} catch {
					// The browser already detached the camera stream.
				}
			}
		},

		prepareCameraElement() {
			const video = this.$refs.video
			if (!video || !this.stream) {
				return
			}
			video.pause()
			video.removeAttribute('src')
			video.load()
			video.controls = false
			video.autoplay = true
			video.muted = true
			if ('srcObject' in video) {
				video.srcObject = this.stream
			}
		},

		async startRecording() {
			if (!this.canStartRecording) {
				return
			}
			this.preparingRecording = true

			try {
				const format = this.formats.find(
					(candidate) => candidate.id === this.selectedFormat,
				)
				if (!format) {
					throw new Error(
						t('forms', 'The selected recording format is unavailable.'),
					)
				}
				const recorderMimeType = getRecorderMimeType(format)
				const options = recorderMimeType
					? { mimeType: recorderMimeType }
					: undefined
				this.recorder = new MediaRecorder(this.stream, options)
				await this.releaseRecordingStore()
				this.recordingStore = new RecordingStore()
				await this.recordingStore.open(
					this.recorder.mimeType || recorderMimeType,
				)
				this.recordingChunks = []
				this.recordingWriteChain = Promise.resolve()
				this.recordingPendingWrites = 0
				this.recordingWriteError = null
				this.recordingFailed = false
				this.recorder.ondataavailable = this.onDataAvailable
				this.recorder.onstart = () => {
					this.statusMessage = ''
				}
				this.recorder.onerror = (event) =>
					this.handleRecorderFailure(event.error)
				this.recorder.onstop = this.onRecorderStopped
				startMediaRecorder(this.recorder)
				this.recording = true
				this.paused = false
				this.elapsedSeconds = 0
				this.recordedBytes = 0
				this.recordingStartedAt = performance.now()
				this.pausedStartedAt = null
				this.totalPausedMilliseconds = 0
				this.startTimer()
				this.statusMessage = ''
			} catch (error) {
				await this.releaseRecordingStore()
				this.recordingChunks = []
				this.recorder = null
				this.recording = false
				this.paused = false
				this.stopTimer()
				this.showStatus(error.message, 'error')
			} finally {
				this.preparingRecording = false
			}
		},

		onDataAvailable(event) {
			if (!event.data?.size) {
				return
			}
			this.recordedBytes += event.data.size
			if (!this.recordingStore || !this.recordingWriteChain) {
				this.recordingChunks.push(event.data)
				return
			}

			this.recordingPendingWrites++
			if (this.recordingPendingWrites > MAX_PENDING_RECORDING_WRITES) {
				this.handleRecorderFailure(
					new Error(
						t(
							'forms',
							'The browser could not save the recorded video fast enough.',
						),
					),
				)
				return
			}

			const chunk = event.data
			const recordingStore = this.recordingStore
			this.recordingWriteChain = this.recordingWriteChain
				.then(() => recordingStore.append(chunk))
				.catch((error) => {
					this.recordingWriteError ||= error
					this.handleRecorderFailure(error)
				})
				.finally(() => {
					this.recordingPendingWrites--
				})
		},

		handleRecorderFailure(error) {
			if (this.recordingFailed) {
				return
			}
			this.recordingFailed = true
			this.showStatus(
				t(
					'forms',
					'Recording stopped because the browser recorder failed: {message}',
					{ message: error?.message || '' },
				),
				'error',
			)
			this.stopRecording()
		},

		togglePause() {
			if (!this.recorder) {
				return
			}
			if (this.paused) {
				if (this.recorder.state === 'paused') {
					this.recorder.resume()
				}
				if (this.pausedStartedAt !== null) {
					this.totalPausedMilliseconds +=
						performance.now() - this.pausedStartedAt
				}
				this.pausedStartedAt = null
				this.paused = false
			} else if (this.recorder.state === 'recording') {
				this.recorder.pause()
				this.paused = true
				this.pausedStartedAt = performance.now()
				this.updateElapsedTime()
			}
		},

		stopRecording() {
			this.updateElapsedTime()
			if (this.recorder && this.recorder.state !== 'inactive') {
				this.recorder.stop()
			}
			this.stopTimer()
		},

		async onRecorderStopped() {
			this.recording = false
			this.finalizing = true
			this.updateElapsedTime()
			this.paused = false
			this.stopTimer()
			try {
				await this.recordingWriteChain
				if (this.recordingWriteError) {
					throw this.recordingWriteError
				}
				if (this.recordingFailed) {
					this.recordingChunks = []
					this.recorder = null
					await this.releaseRecordingStore()
					return
				}
				if (this.recordingStore) {
					this.recordedFile = await this.recordingStore.finalize()
					this.recordedBlob = this.recordedFile
				} else {
					const recording = createRecordedVideo(
						this.recordingChunks,
						this.recorder?.mimeType || '',
					)
					this.recordedBlob = recording.blob
					this.recordedFile = recording.file
				}
				this.recordingChunks = []
				if (this.recordedFile.size > VIDEO_MAX_BYTES) {
					this.recordedBlob = null
					this.recordedFile = null
					throw new Error(t('forms', 'The recorded video exceeds 16 GiB.'))
				}
				this.revokePreviewUrl()
				this.previewUrl = URL.createObjectURL(this.recordedBlob)
				this.recorder = null
				await this.exitImmersiveMode()
				await this.$nextTick()
				this.preparePreviewElement()
			} catch (error) {
				await this.releaseRecordingStore()
				this.recordingChunks = []
				this.recorder = null
				this.recordedBlob = null
				this.recordedFile = null
				this.showStatus(
					error.message === 'Browser recorder returned no video data'
						? t('forms', 'The browser recorder returned no video data.')
						: error.message,
					'error',
				)
			} finally {
				this.finalizing = false
			}
		},

		preparePreviewElement() {
			const video = this.$refs.video
			if (!this.previewUrl || !video) {
				return
			}
			video.pause()
			video.srcObject = null
			video.src = this.previewUrl
			video.autoplay = false
			video.muted = false
			video.controls = true
			video.load()
		},

		startTimer() {
			this.stopTimer()
			this.updateElapsedTime()
			this.timer = window.setInterval(() => {
				this.updateElapsedTime()
				if (
					this.recording
					&& this.elapsedSeconds >= this.maxDurationSeconds
				) {
					this.stopRecording()
				}
			}, 250)
		},

		updateElapsedTime() {
			if (this.recordingStartedAt === null) {
				return
			}
			const now = performance.now()
			this.elapsedSeconds = calculateRecordingElapsedSeconds(
				this.recordingStartedAt,
				now,
				this.totalPausedMilliseconds,
				this.pausedStartedAt,
			)
		},

		stopTimer() {
			if (this.timer !== null) {
				window.clearInterval(this.timer)
				this.timer = null
			}
		},

		chooseExistingVideo() {
			this.$refs.fileInput.click()
		},

		async onExistingVideoSelected(event) {
			const file = event.target.files?.[0]
			event.target.value = ''
			if (!file) {
				return
			}
			try {
				await this.validateExistingVideo(file)
				await this.clearRecordedMedia()
				this.recordedFile = file
				this.recordedBlob = file
				this.previewUrl = URL.createObjectURL(file)
				this.closeCamera()
				await this.$nextTick()
				this.preparePreviewElement()
				this.statusMessage = ''
			} catch (error) {
				this.showStatus(error.message, 'error')
			}
		},

		validateExistingVideo(file) {
			if (!file.type.startsWith('video/')) {
				return Promise.reject(
					new Error(t('forms', 'The selected file is not a video.')),
				)
			}
			if (file.size > VIDEO_MAX_BYTES) {
				return Promise.reject(
					new Error(t('forms', 'The selected video exceeds 16 GiB.')),
				)
			}
			return new Promise((resolve, reject) => {
				const video = document.createElement('video')
				const url = URL.createObjectURL(file)
				const cleanup = () => {
					video.removeAttribute('src')
					video.load()
					URL.revokeObjectURL(url)
				}
				video.preload = 'metadata'
				video.onloadedmetadata = () => {
					if (video.duration > this.maxDurationSeconds) {
						cleanup()
						reject(
							new Error(
								t(
									'forms',
									'The selected video is longer than the allowed duration.',
								),
							),
						)
						return
					}
					cleanup()
					resolve()
				}
				video.onerror = () => {
					cleanup()
					reject(
						new Error(
							t('forms', 'The selected video could not be read.'),
						),
					)
				}
				video.src = url
			})
		},

		async discardRecording() {
			const hasActiveCamera = this.cameraOn && !!this.stream
			const immersiveRequest = hasActiveCamera
				? this.enterImmersiveMode()
				: null
			await this.clearRecordedMedia()
			if (!hasActiveCamera) {
				await this.openCamera()
				return
			}
			await this.$nextTick()
			this.prepareCameraElement()
			await this.$refs.video?.play().catch(() => {})
			await immersiveRequest
		},

		async clearRecordedMedia() {
			this.revokePreviewUrl()
			this.recordedBlob = null
			this.recordedFile = null
			this.recordingChunks = []
			await this.releaseRecordingStore()
			this.elapsedSeconds = 0
			this.recordingStartedAt = null
			this.pausedStartedAt = null
			this.totalPausedMilliseconds = 0
			this.recordedBytes = 0
		},

		async releaseRecordingStore() {
			const store = this.recordingStore
			this.recordingStore = null
			this.recordingWriteChain = null
			this.recordingPendingWrites = 0
			this.recordingWriteError = null
			if (store) {
				await store.remove()
			}
		},

		revokePreviewUrl() {
			if (this.previewUrl) {
				const video = this.$refs.video
				if (video) {
					video.pause()
					if ('srcObject' in video) {
						video.srcObject = null
					}
					video.removeAttribute('src')
					video.load()
					video.controls = false
					video.autoplay = true
					video.muted = true
				}
				URL.revokeObjectURL(this.previewUrl)
				this.previewUrl = ''
			}
		},

		async confirmUpload() {
			if (!this.recordedFile || this.uploading) {
				return
			}
			this.uploading = true
			this.uploadProgress = 0
			this.uploadController = new AbortController()
			try {
				const uploadedFile = await uploadVideo({
					formId: this.formId,
					questionId: this.id,
					shareHash: loadState('forms', 'shareHash', null),
					file: this.recordedFile,
					signal: this.uploadController.signal,
					onProgress: (progress) => {
						this.uploadProgress = progress
					},
				})
				this.$emit('update:values', [uploadedFile])
				this.revokePreviewUrl()
				this.recordedBlob = null
				this.recordedFile = null
				await this.releaseRecordingStore()
				this.closeCamera()
				await this.exitImmersiveMode()
				this.showStatus(t('forms', 'Video uploaded.'), 'success')
			} catch (error) {
				if (error.code !== 'ERR_CANCELED') {
					this.showStatus(
						t('forms', 'Video upload failed: {message}', {
							message: error.message,
						}),
						'error',
					)
				}
			} finally {
				this.uploading = false
				this.uploadController = null
			}
		},

		cancelUpload() {
			this.uploadController?.abort()
		},

		replaceUploadedVideo() {
			this.$emit('update:values', [])
			this.statusMessage = ''
		},

		showStatus(message, type) {
			this.statusMessage = message
			this.statusType = type
		},

		async validate() {
			if (
				this.uploading
				|| this.recording
				|| this.recordingBusy
				|| this.paused
			) {
				this.errorMessage = t(
					'forms',
					'Please finish the video before submitting the form.',
				)
				return false
			}
			if (this.isRequired && !this.hasUploadedValue) {
				this.errorMessage = t(
					'forms',
					'Please upload a video before submitting the form.',
				)
				return false
			}
			this.errorMessage = null
			return true
		},
	},
}
</script>

<style scoped lang="scss">
.video-question-placeholder,
.uploaded-video,
.video-actions,
.video-settings {
	display: flex;
	align-items: center;
	gap: calc(2 * var(--default-grid-baseline));
}

.video-question-placeholder p {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.video-recorder {
	display: flex;
	flex-direction: column;
	gap: calc(2 * var(--default-grid-baseline));
	max-width: 900px;
}

.video-stage {
	position: relative;
	background: #000;
	border-radius: var(--border-radius-large);
	overflow: hidden;
	aspect-ratio: 16 / 9;
}

.video-stage video {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
}

.video-side-controls,
.rotate-device-overlay {
	display: none;
}

.video-recorder--immersive {
	position: fixed;
	z-index: 100000;
	inset: 0;
	box-sizing: border-box;
	width: 100vw;
	max-width: none;
	height: 100vh;
	height: 100dvh;
	margin: 0;
	padding: 0;
	border: 0;
	gap: 0;
	overflow: hidden;
	overscroll-behavior: none;
	background: #000;
}

.video-recorder--immersive::backdrop {
	background: #000;
}

.video-recorder--native-fullscreen {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
}

.video-recorder--immersive .video-stage {
	flex: 1 1 auto;
	min-height: 0;
	border-radius: 0;
	aspect-ratio: auto;
}

.video-recorder--immersive .settings-badge {
	inset-inline-end: calc(78px + env(safe-area-inset-right));
}

.video-recorder--immersive .video-side-controls {
	position: absolute;
	z-index: 6;
	inset-block: max(8px, env(safe-area-inset-top))
		max(8px, env(safe-area-inset-bottom));
	inset-inline-end: max(8px, env(safe-area-inset-right));
	display: flex;
	width: 64px;
	flex-direction: column;
	justify-content: center;
	gap: 8px;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: 8px;
	border-radius: var(--border-radius-large);
	background: rgb(0 0 0 / 58%);
	touch-action: manipulation;
}

.video-recorder--immersive .video-side-controls :deep(button) {
	width: 100%;
	min-height: 48px;
	padding: 4px;
}

.video-side-timer {
	display: block;
	width: 100%;
	padding: 4px;
	border-radius: var(--border-radius-pill);
	background: rgb(180 0 0 / 90%);
	color: #fff;
	font-family: monospace;
	font-size: 16px;
	font-variant-numeric: tabular-nums;
	font-weight: 700;
	text-align: center;
}

.video-recorder--immersive .rotate-device-overlay {
	position: absolute;
	z-index: 5;
	inset: 0;
	display: grid;
	place-items: center;
	padding: 24px 110px 24px 24px;
	background: rgb(0 0 0 / 76%);
	color: #fff;
	font-size: 18px;
	text-align: center;
}

.video-recorder--immersive > .video-settings {
	position: absolute;
	z-index: 7;
	inset-inline: max(8px, env(safe-area-inset-left))
		calc(88px + env(safe-area-inset-right));
	inset-block-end: max(8px, env(safe-area-inset-bottom));
	padding: 10px;
	border-radius: var(--border-radius-large);
	background: rgb(0 0 0 / 82%);
	color: #fff;
}

.video-recorder--immersive > .video-settings select {
	background: rgb(30 30 30 / 95%);
	color: #fff;
}

.video-recorder--immersive > .video-actions {
	display: none;
}

.video-recorder--immersive > .video-inline-note {
	position: absolute;
	z-index: 8;
	inset-inline-start: max(8px, env(safe-area-inset-left));
	inset-inline-end: calc(88px + env(safe-area-inset-right));
	inset-block-end: max(8px, env(safe-area-inset-bottom));
}

.video-recorder--immersive.video-recorder--portrait .settings-badge {
	inset-inline-end: calc(2 * var(--default-grid-baseline));
}

.video-recorder--immersive.video-recorder--portrait .video-side-controls {
	inset-block-start: auto;
	inset-block-end: max(8px, env(safe-area-inset-bottom));
	inset-inline: max(8px, env(safe-area-inset-left))
		max(8px, env(safe-area-inset-right));
	width: auto;
	height: 64px;
	flex-direction: row;
	justify-content: flex-start;
	justify-content: safe center;
	overflow-x: auto;
	overflow-y: hidden;
}

.video-recorder--immersive.video-recorder--portrait
	.video-side-controls
	:deep(button) {
	width: 48px;
	min-width: 48px;
	height: 48px;
}

.video-recorder--immersive.video-recorder--portrait .video-side-timer {
	width: auto;
	min-width: 68px;
}

.video-recorder--immersive.video-recorder--portrait .rotate-device-overlay {
	padding: 24px 24px 96px;
}

.video-recorder--immersive.video-recorder--portrait > .video-settings {
	inset-inline: max(8px, env(safe-area-inset-left))
		max(8px, env(safe-area-inset-right));
	inset-block-end: calc(80px + env(safe-area-inset-bottom));
	max-height: calc(100dvh - 96px - env(safe-area-inset-bottom));
	overflow-y: auto;
}

.video-recorder--immersive.video-recorder--portrait > .video-inline-note {
	inset-inline-start: max(8px, env(safe-area-inset-left));
	inset-inline-end: max(8px, env(safe-area-inset-right));
	inset-block-end: calc(80px + env(safe-area-inset-bottom));
}

.recording-badge,
.settings-badge,
.recording-timer {
	pointer-events: none;
}

.recording-badge,
.settings-badge {
	position: absolute;
	inset-block-start: calc(2 * var(--default-grid-baseline));
	padding: var(--default-grid-baseline) calc(2 * var(--default-grid-baseline));
	border-radius: var(--border-radius-pill);
	background: rgb(0 0 0 / 70%);
	color: #fff;
}

.recording-badge {
	z-index: 9;
	inset-inline-start: calc(2 * var(--default-grid-baseline));
	background: rgb(180 0 0 / 85%);
}

.recording-timer {
	position: absolute;
	z-index: 10;
	inset-block-start: calc(2 * var(--default-grid-baseline));
	inset-inline-start: 50%;
	min-width: 88px;
	transform: translateX(-50%);
	padding: var(--default-grid-baseline) calc(2 * var(--default-grid-baseline));
	border-radius: var(--border-radius-pill);
	background: rgb(0 0 0 / 78%);
	color: #fff;
	font-family: monospace;
	font-size: 18px;
	font-variant-numeric: tabular-nums;
	font-weight: 700;
	letter-spacing: 1px;
	text-align: center;
}

.recording-badge--idle {
	background: rgb(0 0 0 / 70%);
}

.settings-badge {
	inset-inline-end: calc(2 * var(--default-grid-baseline));
}

.video-settings {
	align-items: flex-end;
	flex-wrap: wrap;
}

.video-settings label {
	display: flex;
	flex: 1 1 180px;
	flex-direction: column;
	gap: var(--default-grid-baseline);
}

.video-settings select {
	min-height: var(--default-clickable-area);
	border: var(--border-width-input) solid var(--color-border-maxcontrast);
	border-radius: var(--border-radius-element);
	background: var(--color-main-background);
	color: var(--color-main-text);
	padding-inline: calc(2 * var(--default-grid-baseline));
}

.video-actions {
	flex-wrap: wrap;
}

progress {
	width: 100%;
}

@media (width <= 600px) {
	.video-settings {
		align-items: stretch;
		flex-direction: column;
	}

	.video-actions > * {
		flex: 1 1 auto;
	}
}
</style>
