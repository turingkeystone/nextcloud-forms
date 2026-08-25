<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Forms\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/** @extends QBMapper<VideoUploadSession> */
class VideoUploadSessionMapper extends QBMapper {
	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'forms_v2_video_uploads', VideoUploadSession::class);
	}

	/** @throws DoesNotExistException */
	public function findBySessionToken(string $sessionToken): VideoUploadSession {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->eq('session_token', $qb->createNamedParameter($sessionToken)));

		return $this->findEntity($qb);
	}

	/** @return VideoUploadSession[] */
	public function findExpired(int $timestamp, int $limit = 100): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')
			->from($this->getTableName())
			->where($qb->expr()->lt('expires', $qb->createNamedParameter($timestamp)))
			->setMaxResults($limit);

		return $this->findEntities($qb);
	}

	public function transitionState(int $id, string $from, string $to, int $updated, ?int $expires = null): bool {
		$qb = $this->db->getQueryBuilder();
		$qb->update($this->getTableName())
			->set('state', $qb->createNamedParameter($to))
			->set('updated', $qb->createNamedParameter($updated, IQueryBuilder::PARAM_INT));
		if ($expires !== null) {
			$qb->set('expires', $qb->createNamedParameter($expires, IQueryBuilder::PARAM_INT));
		}
		$affected = $qb
			->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('state', $qb->createNamedParameter($from)))
			->executeStatement();

		return $affected === 1;
	}
}
