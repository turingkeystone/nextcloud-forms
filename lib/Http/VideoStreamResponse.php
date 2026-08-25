<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Http;

use OCP\AppFramework\Http;
use OCP\AppFramework\Http\ICallbackResponse;
use OCP\AppFramework\Http\IOutput;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;

/**
 * @extends Response<Http::STATUS_OK|Http::STATUS_PARTIAL_CONTENT, array<string, string>>
 */
class VideoStreamResponse extends Response implements ICallbackResponse {
	private const OUTPUT_CHUNK_SIZE = 1024 * 1024;

	public function __construct(
		private readonly File $file,
		private readonly int $start,
		private readonly int $end,
		bool $download,
		private readonly bool $sendBody = true,
	) {
		$status = $start === 0 && $end === (int)$file->getSize() - 1
			? Http::STATUS_OK
			: Http::STATUS_PARTIAL_CONTENT;
		$fileName = str_replace(["\r", "\n", '"', '/', '\\'], '-', $file->getName());
		$disposition = $download ? 'attachment' : 'inline';
		$headers = [
			'Accept-Ranges' => 'bytes',
			'Content-Type' => $file->getMimeType(),
			'Content-Length' => (string)($end - $start + 1),
			'Content-Disposition' => sprintf(
				'%s; filename="%s"; filename*=UTF-8\'\'%s',
				$disposition,
				$fileName,
				rawurlencode($file->getName()),
			),
		];
		if ($status === Http::STATUS_PARTIAL_CONTENT) {
			$headers['Content-Range'] = sprintf('bytes %d-%d/%d', $start, $end, $file->getSize());
		}
		parent::__construct($status, $headers);
		$this->setETag($file->getEtag());
		$this->setLastModified((new \DateTime())->setTimestamp($file->getMTime()));
	}

	public function callback(IOutput $output): void {
		if (!$this->sendBody || $output->getHttpResponseCode() === Http::STATUS_NOT_MODIFIED) {
			return;
		}

		$stream = $this->file->fopen('r');
		if (!is_resource($stream) || fseek($stream, $this->start) !== 0) {
			if (is_resource($stream)) {
				fclose($stream);
			}
			$output->setHttpResponseCode(Http::STATUS_BAD_REQUEST);
			return;
		}

		$remaining = $this->end - $this->start + 1;
		try {
			while ($remaining > 0 && !feof($stream) && connection_status() === CONNECTION_NORMAL) {
				$data = fread($stream, min(self::OUTPUT_CHUNK_SIZE, $remaining));
				if ($data === false || $data === '') {
					break;
				}
				$output->setOutput($data);
				$remaining -= strlen($data);
			}
		} finally {
			fclose($stream);
		}
	}
}
