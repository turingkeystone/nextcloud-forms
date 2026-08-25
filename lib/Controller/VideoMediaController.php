<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Controller;

use OCA\Forms\Constants;
use OCA\Forms\Db\AnswerMapper;
use OCA\Forms\Db\QuestionMapper;
use OCA\Forms\Db\SubmissionMapper;
use OCA\Forms\Exception\NoSuchFormException;
use OCA\Forms\Http\VideoStreamResponse;
use OCA\Forms\Service\FormsService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;

class VideoMediaController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private readonly IUserSession $userSession,
		private readonly AnswerMapper $answerMapper,
		private readonly QuestionMapper $questionMapper,
		private readonly SubmissionMapper $submissionMapper,
		private readonly FormsService $formsService,
		private readonly IRootFolder $rootFolder,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[FrontpageRoute(verb: 'GET', url: '/video-answers/{answerId}')]
	public function show(int $answerId, bool $download = false): Response {
		return $this->createResponse($answerId, $download, true);
	}

	#[NoAdminRequired()]
	#[NoCSRFRequired()]
	#[FrontpageRoute(verb: 'HEAD', url: '/video-answers/{answerId}')]
	public function head(int $answerId, bool $download = false): Response {
		return $this->createResponse($answerId, $download, false);
	}

	private function createResponse(int $answerId, bool $download, bool $sendBody): Response {
		try {
			$answer = $this->answerMapper->findById($answerId);
			$question = $this->questionMapper->findById($answer->getQuestionId());
			$submission = $this->submissionMapper->findById($answer->getSubmissionId());
		} catch (DoesNotExistException) {
			return new Response(Http::STATUS_NOT_FOUND);
		}
		if ($question->getType() !== Constants::ANSWER_TYPE_VIDEO
			|| $question->getFormId() !== $submission->getFormId()
			|| $answer->getFileId() === null) {
			return new Response(Http::STATUS_NOT_FOUND);
		}

		try {
			$form = $this->formsService->getFormIfAllowed($submission->getFormId(), Constants::PERMISSION_RESULTS);
		} catch (NoSuchFormException $e) {
			return new Response($e->getCode());
		}
		$canSeeAll = in_array(Constants::PERMISSION_RESULTS, $this->formsService->getPermissions($form), true);
		$currentUser = $this->userSession->getUser();
		if (!$canSeeAll && ($currentUser === null || $submission->getUserId() !== $currentUser->getUID())) {
			return new Response(Http::STATUS_FORBIDDEN);
		}

		$nodes = $this->rootFolder->getUserFolder($form->getOwnerId())->getById($answer->getFileId());
		$file = $nodes[0] ?? null;
		if (!$file instanceof File || !str_starts_with($file->getMimeType(), 'video/')) {
			return new Response(Http::STATUS_NOT_FOUND);
		}

		$size = (int)$file->getSize();
		[$start, $end] = $this->parseRange($this->request->getHeader('Range'), $size);
		if ($start === null || $end === null) {
			return new Response(Http::STATUS_REQUEST_RANGE_NOT_SATISFIABLE, [
				'Accept-Ranges' => 'bytes',
				'Content-Range' => 'bytes */' . $size,
			]);
		}

		return new VideoStreamResponse($file, $start, $end, $download, $sendBody);
	}

	/** @return array{?int, ?int} */
	private function parseRange(string $header, int $size): array {
		if ($size < 1) {
			return [null, null];
		}
		if ($header === '') {
			return [0, $size - 1];
		}
		if (!preg_match('/^bytes=(\d*)-(\d*)$/', trim($header), $matches)
			|| ($matches[1] === '' && $matches[2] === '')) {
			return [null, null];
		}
		if ($matches[1] === '') {
			$suffixLength = min((int)$matches[2], $size);
			return $suffixLength > 0 ? [$size - $suffixLength, $size - 1] : [null, null];
		}

		$start = (int)$matches[1];
		$end = $matches[2] === '' ? $size - 1 : min((int)$matches[2], $size - 1);
		if ($start >= $size || $end < $start) {
			return [null, null];
		}
		return [$start, $end];
	}
}
