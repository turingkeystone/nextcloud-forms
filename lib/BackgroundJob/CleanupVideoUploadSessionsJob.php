<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\BackgroundJob;

use OCA\Forms\Service\VideoUploadSessionService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

class CleanupVideoUploadSessionsJob extends TimedJob {
	public function __construct(
		private readonly VideoUploadSessionService $uploadService,
		private readonly LoggerInterface $logger,
		ITimeFactory $time,
	) {
		parent::__construct($time);
		$this->setInterval(15 * 60);
	}

	public function run($argument): void {
		$deleted = $this->uploadService->cleanupExpired();
		if ($deleted > 0) {
			$this->logger->info('Deleted {count} expired video upload sessions', [
				'count' => $deleted,
			]);
		}
	}
}
