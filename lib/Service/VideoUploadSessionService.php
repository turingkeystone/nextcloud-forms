<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Service;

use OCA\Forms\Constants;
use OCA\Forms\Db\FormMapper;
use OCA\Forms\Db\Question;
use OCA\Forms\Db\QuestionMapper;
use OCA\Forms\Db\UploadedFile;
use OCA\Forms\Db\UploadedFileMapper;
use OCA\Forms\Db\VideoUploadSession;
use OCA\Forms\Db\VideoUploadSessionMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\OCS\OCSBadRequestException;
use OCP\AppFramework\OCS\OCSForbiddenException;
use OCP\AppFramework\OCS\OCSNotFoundException;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\Folder;
use OCP\Files\IAppData;
use OCP\Files\InvalidContentException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use OCP\Security\ISecureRandom;
use Psr\Log\LoggerInterface;

class VideoUploadSessionService {
	public const CHUNK_SIZE = 4 * 1024 * 1024;
	public const MAX_VIDEO_SIZE = 16 * 1024 * 1024 * 1024;
	private const SESSION_LIFETIME = 2 * 60 * 60;
	private const APPDATA_FOLDER = 'video-upload-sessions';

	public function __construct(
		private readonly FormsService $formsService,
		private readonly FormMapper $formMapper,
		private readonly QuestionMapper $questionMapper,
		private readonly VideoUploadSessionMapper $sessionMapper,
		private readonly UploadedFileMapper $uploadedFileMapper,
		private readonly IAppData $appData,
		private readonly IRootFolder $rootFolder,
		private readonly ISecureRandom $secureRandom,
		private readonly ITimeFactory $timeFactory,
		private readonly LoggerInterface $logger,
	) {
	}

	/** @return array{sessionId: string, uploadToken: string, chunkSize: int, expires: int} */
	public function create(
		int $formId,
		int $questionId,
		string $fileName,
		string $mimeType,
		int $totalSize,
		string $shareHash,
	): array {
		$form = $this->formsService->loadFormForSubmission($formId, $shareHash);
		if (!$this->formsService->canSubmit($form)) {
			throw new OCSForbiddenException('Already submitted');
		}

		$question = $this->getVideoQuestion($formId, $questionId);
		$this->validateMetadata($fileName, $mimeType, $totalSize);

		$sessionId = $this->secureRandom->generate(40, ISecureRandom::CHAR_ALPHANUMERIC);
		$uploadToken = $this->secureRandom->generate(48, ISecureRandom::CHAR_ALPHANUMERIC);
		$now = $this->timeFactory->getTime();
		$session = new VideoUploadSession();
		$session->setSessionToken($sessionId);
		$session->setUploadTokenHash(hash('sha256', $uploadToken));
		$session->setFormId($formId);
		$session->setQuestionId($question->getId());
		$session->setOwnerId($form->getOwnerId());
		$session->setFileName($fileName);
		$session->setMimeType($mimeType);
		$session->setTotalSize($totalSize);
		$session->setReceivedSize(0);
		$session->setChunkSize(self::CHUNK_SIZE);
		$session->setChunkCount((int)ceil($totalSize / self::CHUNK_SIZE));
		$session->setState('open');
		$session->setCreated($now);
		$session->setUpdated($now);
		$session->setExpires($now + self::SESSION_LIFETIME);
		$this->sessionMapper->insert($session);

		try {
			$this->getSessionFolder($sessionId, true);
		} catch (\Throwable $e) {
			$this->sessionMapper->delete($session);
			throw $e;
		}

		return [
			'sessionId' => $sessionId,
			'uploadToken' => $uploadToken,
			'chunkSize' => self::CHUNK_SIZE,
			'expires' => $session->getExpires(),
		];
	}

	/** @param resource $input */
	public function putChunk(
		string $sessionId,
		string $uploadToken,
		int $index,
		string $contentRange,
		$input,
	): array {
		$session = $this->getAuthorizedSession($sessionId, $uploadToken);
		if ($session->getState() !== 'open') {
			throw new OCSBadRequestException('Upload session is not open');
		}
		if (!is_resource($input)) {
			throw new OCSBadRequestException('Chunk body is missing');
		}

		$expectedSize = $this->validateChunkRange($session, $index, $contentRange);
		$folder = $this->getSessionFolder($sessionId, false);
		$chunkName = $this->getChunkName($index);
		if ($folder->fileExists($chunkName)) {
			$existingChunk = $folder->getFile($chunkName);
			if ((int)$existingChunk->getSize() === $expectedSize) {
				return $this->statusArray($session);
			}
			// A disconnected multipart request can leave a truncated app-data file
			// before the controller receives an error response. The capability token
			// authorizes replacing that incomplete chunk on a retry.
			$existingChunk->delete();
		}

		$chunk = $folder->newFile($chunkName);
		try {
			$output = $chunk->write();
			if (!is_resource($output)) {
				throw new \RuntimeException('Could not open video chunk for writing');
			}
			try {
				$copied = stream_copy_to_stream($input, $output, $expectedSize + 1);
			} finally {
				fclose($output);
			}
			if ($copied === false || $copied !== $expectedSize) {
				throw new OCSBadRequestException('Chunk size does not match Content-Range');
			}
		} catch (\Throwable $e) {
			try {
				$chunk->delete();
			} catch (\Throwable) {
				// The failed write can already have removed the partial chunk.
			}
			throw $e;
		}

		$now = $this->timeFactory->getTime();
		$session->setReceivedSize($session->getReceivedSize() + $expectedSize);
		$session->setUpdated($now);
		$session->setExpires($now + self::SESSION_LIFETIME);
		$this->sessionMapper->update($session);

		return $this->statusArray($session);
	}

	public function status(string $sessionId, string $uploadToken): array {
		return $this->statusArray($this->getAuthorizedSession($sessionId, $uploadToken));
	}

	/** @return array{uploadedFileId: int, fileName: string, uploadToken: string} */
	public function complete(string $sessionId, string $uploadToken): array {
		$session = $this->getAuthorizedSession($sessionId, $uploadToken);
		if ($session->getState() === 'completed' && $session->getUploadedFileId() !== null) {
			return $this->uploadedFileAnswer($this->uploadedFileMapper->getByUploadedFileId((string)$session->getUploadedFileId()));
		}
		$assemblyStarted = $this->timeFactory->getTime();
		if ($session->getState() !== 'open'
			|| !$this->sessionMapper->transitionState(
				$session->getId(),
				'open',
				'assembling',
				$assemblyStarted,
				$assemblyStarted + self::SESSION_LIFETIME,
			)) {
			throw new OCSBadRequestException('Upload session cannot be completed');
		}

		$targetFile = null;
		try {
			$folder = $this->getSessionFolder($sessionId, false);
			$this->validateAllChunks($session, $folder);
			try {
				$form = $this->formMapper->findById($session->getFormId());
			} catch (DoesNotExistException) {
				throw new OCSNotFoundException('Form no longer exists');
			}
			$question = $this->getVideoQuestion($session->getFormId(), $session->getQuestionId());
			$userFolder = $this->rootFolder->getUserFolder($session->getOwnerId());
			$path = $this->formsService->getTemporaryUploadedFilePath($form, $question);
			$userFolder->getStorage()->verifyPath($path, $session->getFileName());
			$targetFolder = $userFolder->nodeExists($path)
				? $userFolder->get($path)
				: $userFolder->newFolder($path);
			if (!$targetFolder instanceof Folder) {
				throw new OCSBadRequestException('Temporary upload path is not a folder');
			}

			$fileName = $targetFolder->getNonExistingName($session->getFileName());
			$targetFile = $targetFolder->newFile($fileName);
			$output = $targetFile->fopen('w');
			if (!is_resource($output)) {
				throw new \RuntimeException('Could not open destination video');
			}

			$written = 0;
			try {
				for ($index = 0; $index < $session->getChunkCount(); $index++) {
					$input = $folder->getFile($this->getChunkName($index))->read();
					if (!is_resource($input)) {
						throw new \RuntimeException('Could not read video chunk');
					}
					try {
						$copied = stream_copy_to_stream($input, $output);
						if ($copied === false) {
							throw new \RuntimeException('Could not assemble video chunk');
						}
						$written += $copied;
					} finally {
						fclose($input);
					}
				}
			} finally {
				fclose($output);
			}

			if ($written !== $session->getTotalSize()) {
				throw new OCSBadRequestException('Assembled video size is invalid');
			}
			if (!str_starts_with($targetFile->getMimeType(), 'video/')) {
				throw new OCSBadRequestException('Uploaded content is not a recognized video');
			}

			$answerToken = $this->secureRandom->generate(32, ISecureRandom::CHAR_ALPHANUMERIC);
			$uploadedFile = new UploadedFile();
			$uploadedFile->setFormId($session->getFormId());
			$uploadedFile->setQuestionId($session->getQuestionId());
			$uploadedFile->setUploadToken($answerToken);
			$uploadedFile->setOriginalFileName($fileName);
			$uploadedFile->setFileId($targetFile->getId());
			$uploadedFile->setCreated($this->timeFactory->getTime());
			$this->uploadedFileMapper->insert($uploadedFile);

			$session->setState('completed');
			$session->setUploadedFileId($uploadedFile->getId());
			$session->setUpdated($this->timeFactory->getTime());
			$this->sessionMapper->update($session);
			$this->deleteSessionFolder($sessionId);

			return $this->uploadedFileAnswer($uploadedFile);
		} catch (InvalidContentException $e) {
			$this->deleteTarget($targetFile);
			$session->setState('rejected');
			$session->setUpdated($this->timeFactory->getTime());
			$this->sessionMapper->update($session);
			$this->deleteSessionFolder($sessionId);
			$this->logger->warning('Video upload rejected by content scanner', [
				'formId' => $session->getFormId(),
				'questionId' => $session->getQuestionId(),
				'exception' => $e,
			]);
			throw new OCSBadRequestException('The video was rejected by the content scanner');
		} catch (\Throwable $e) {
			$this->deleteTarget($targetFile);
			$this->sessionMapper->transitionState($session->getId(), 'assembling', 'open', $this->timeFactory->getTime());
			throw $e;
		}
	}

	public function cancel(string $sessionId, string $uploadToken): void {
		$session = $this->getAuthorizedSession($sessionId, $uploadToken, false);
		// Once assembly has started, the request can continue server-side even if
		// the browser loses the response or aborts its connection. Deleting chunks
		// at that point would race with complete() and corrupt an otherwise valid
		// upload.
		if ($session->getState() !== 'open') {
			return;
		}
		$this->deleteSessionFolder($sessionId);
		$this->sessionMapper->delete($session);
	}

	public function cleanupExpired(int $limit = 100): int {
		$deleted = 0;
		foreach ($this->sessionMapper->findExpired($this->timeFactory->getTime(), $limit) as $session) {
			$this->deleteSessionFolder($session->getSessionToken());
			$this->sessionMapper->delete($session);
			$deleted++;
		}
		return $deleted;
	}

	private function getVideoQuestion(int $formId, int $questionId): Question {
		try {
			$question = $this->questionMapper->findById($questionId);
		} catch (DoesNotExistException) {
			throw new OCSNotFoundException('Could not find video question');
		}
		if ($question->getFormId() !== $formId || $question->getType() !== Constants::ANSWER_TYPE_VIDEO) {
			throw new OCSBadRequestException('Question is not a video question on this form');
		}
		return $question;
	}

	private function validateMetadata(string $fileName, string $mimeType, int $totalSize): void {
		if ($fileName === '' || strlen($fileName) > 255
			|| str_contains($fileName, '/') || str_contains($fileName, '\\')
			|| preg_match('/[\x00-\x1F\x7F]/', $fileName)) {
			throw new OCSBadRequestException('Invalid video file name');
		}
		if (strlen($mimeType) > 255 || !str_starts_with(strtolower($mimeType), 'video/')) {
			throw new OCSBadRequestException('Invalid video MIME type');
		}
		if ($totalSize < 1 || $totalSize > self::MAX_VIDEO_SIZE) {
			throw new OCSBadRequestException('Video size exceeds the 16 GiB limit');
		}
	}

	private function getAuthorizedSession(string $sessionId, string $uploadToken, bool $checkExpiry = true): VideoUploadSession {
		if (!preg_match('/^[A-Za-z0-9]{40}$/', $sessionId)
			|| !preg_match('/^[A-Za-z0-9]{48}$/', $uploadToken)) {
			throw new OCSNotFoundException('Upload session not found');
		}
		try {
			$session = $this->sessionMapper->findBySessionToken($sessionId);
		} catch (DoesNotExistException) {
			throw new OCSNotFoundException('Upload session not found');
		}
		if (!hash_equals($session->getUploadTokenHash(), hash('sha256', $uploadToken))) {
			throw new OCSNotFoundException('Upload session not found');
		}
		if ($checkExpiry && $session->getExpires() < $this->timeFactory->getTime()) {
			throw new OCSNotFoundException('Upload session expired');
		}
		return $session;
	}

	private function validateChunkRange(VideoUploadSession $session, int $index, string $contentRange): int {
		if ($index < 0 || $index >= $session->getChunkCount()) {
			throw new OCSBadRequestException('Chunk index is out of range');
		}
		if (!preg_match('/^bytes (\d+)-(\d+)\/(\d+)$/', $contentRange, $matches)) {
			throw new OCSBadRequestException('Invalid Content-Range header');
		}
		$start = $index * $session->getChunkSize();
		$end = min($session->getTotalSize(), $start + $session->getChunkSize()) - 1;
		if ((int)$matches[1] !== $start || (int)$matches[2] !== $end || (int)$matches[3] !== $session->getTotalSize()) {
			throw new OCSBadRequestException('Content-Range does not match the upload session');
		}
		return $end - $start + 1;
	}

	private function validateAllChunks(VideoUploadSession $session, ISimpleFolder $folder): void {
		for ($index = 0; $index < $session->getChunkCount(); $index++) {
			$name = $this->getChunkName($index);
			if (!$folder->fileExists($name)) {
				throw new OCSBadRequestException('Upload is incomplete');
			}
		}
	}

	private function getSessionFolder(string $sessionId, bool $create): ISimpleFolder {
		try {
			$root = $this->appData->getFolder(self::APPDATA_FOLDER);
		} catch (NotFoundException) {
			$root = $this->appData->newFolder(self::APPDATA_FOLDER);
		}
		try {
			return $root->getFolder($sessionId);
		} catch (NotFoundException) {
			if (!$create) {
				throw new OCSNotFoundException('Upload session data not found');
			}
			return $root->newFolder($sessionId);
		}
	}

	private function deleteSessionFolder(string $sessionId): void {
		try {
			$this->getSessionFolder($sessionId, false)->delete();
		} catch (NotFoundException|OCSNotFoundException) {
			// Already clean.
		} catch (\Throwable $e) {
			$this->logger->warning('Could not clean video upload chunks', [
				'exception' => $e,
			]);
		}
	}

	private function deleteTarget(mixed $targetFile): void {
		try {
			$targetFile?->delete();
		} catch (\Throwable) {
			// The antivirus wrapper can already have removed the target.
		}
	}

	private function getChunkName(int $index): string {
		return sprintf('%08d.part', $index);
	}

	private function statusArray(VideoUploadSession $session): array {
		return [
			'sessionId' => $session->getSessionToken(),
			'state' => $session->getState(),
			'receivedSize' => $session->getReceivedSize(),
			'totalSize' => $session->getTotalSize(),
			'chunkSize' => $session->getChunkSize(),
			'chunkCount' => $session->getChunkCount(),
			'expires' => $session->getExpires(),
		];
	}

	/** @return array{uploadedFileId: int, fileName: string, uploadToken: string} */
	private function uploadedFileAnswer(UploadedFile $uploadedFile): array {
		return [
			'uploadedFileId' => $uploadedFile->getId(),
			'fileName' => $uploadedFile->getOriginalFileName(),
			'uploadToken' => $uploadedFile->getUploadToken() ?? '',
		];
	}
}
