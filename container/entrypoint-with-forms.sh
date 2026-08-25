#!/bin/bash

# SPDX-FileCopyrightText: 2026 turingkeystone
# SPDX-License-Identifier: AGPL-3.0-or-later

set -Eeuo pipefail

readonly NEXTCLOUD_ROOT="${NEXTCLOUD_ROOT:-/var/www/html}"
readonly BUNDLED_FORMS_ROOT="${BUNDLED_FORMS_ROOT:-/opt/nextcloud-bundles/forms}"
readonly AIO_ENTRYPOINT="${AIO_ENTRYPOINT:-/entrypoint.aio.sh}"
readonly FORMS_SYNC_SCRIPT="${FORMS_SYNC_SCRIPT:-/sync-forms-bundle.sh}"
readonly REVISION_MARKER="${NEXTCLOUD_ROOT}/custom_apps/.forms-bundle-revision"
readonly BUNDLE_REVISION="${BUNDLED_FORMS_REVISION:-unknown}"

read_bundle_metadata() {
	php -r '
		$xml = simplexml_load_file($argv[1]);
		if ($xml === false) {
			fwrite(STDERR, "Cannot read bundled app metadata\n");
			exit(1);
		}
		echo (string)$xml->id, "\t", (string)$xml->version, "\t",
			(string)$xml->dependencies->nextcloud["min-version"], "\t",
			(string)$xml->dependencies->nextcloud["max-version"], PHP_EOL;
	' "${BUNDLED_FORMS_ROOT}/appinfo/info.xml"
}

IFS=$'\t' read -r APP_ID BUNDLE_VERSION NEXTCLOUD_MIN NEXTCLOUD_MAX < <(read_bundle_metadata)
readonly APP_ID BUNDLE_VERSION NEXTCLOUD_MIN NEXTCLOUD_MAX

if [[ "${APP_ID}" != "forms" || -z "${BUNDLE_VERSION}" || ! "${NEXTCLOUD_MIN}" =~ ^[0-9]+$ || ! "${NEXTCLOUD_MAX}" =~ ^[0-9]+$ ]]; then
	echo "The bundled Forms metadata is invalid." >&2
	exit 1
fi

nextcloud_major() {
	php -r 'require $argv[1]; echo (int)$OC_Version[0];' "$1"
}

assert_compatible() {
	local version_file="$1"
	local major

	[[ -f "${version_file}" ]] || return 0
	major="$(nextcloud_major "${version_file}")"
	if (( major < NEXTCLOUD_MIN || major > NEXTCLOUD_MAX )); then
		echo "Bundled Forms ${BUNDLE_VERSION} supports Nextcloud ${NEXTCLOUD_MIN}-${NEXTCLOUD_MAX}, but this image contains Nextcloud ${major}." >&2
		exit 1
	fi
}

live_bundle_version() {
	local info_file="${NEXTCLOUD_ROOT}/custom_apps/forms/appinfo/info.xml"
	[[ -f "${info_file}" ]] || return 1
	php -r '$xml = simplexml_load_file($argv[1]); if ($xml === false) { exit(1); } echo (string)$xml->version;' "${info_file}"
}

bundle_is_current() {
	local installed_revision installed_version
	[[ -f "${REVISION_MARKER}" ]] || return 1
	installed_revision="$(<"${REVISION_MARKER}")"
	installed_version="$(live_bundle_version)" || return 1
	[[ "${installed_revision}" == "${BUNDLE_REVISION}" && "${installed_version}" == "${BUNDLE_VERSION}" ]]
}

sync_bundle_if_needed() {
	if bundle_is_current; then
		return 0
	fi

	env \
		BUNDLED_FORMS_ROOT="${BUNDLED_FORMS_ROOT}" \
		NEXTCLOUD_ROOT="${NEXTCLOUD_ROOT}" \
		"${FORMS_SYNC_SCRIPT}"
}

assert_compatible "/usr/src/nextcloud/version.php"

# Protect the private build from app-store replacement during an official AIO
# core upgrade. A fresh install has no live tree yet and is handled by the copy
# under /usr/src/nextcloud/custom_apps.
if [[ -f "${NEXTCLOUD_ROOT}/version.php" ]]; then
	sync_bundle_if_needed
fi

bash "${AIO_ENTRYPOINT}"

assert_compatible "${NEXTCLOUD_ROOT}/version.php"
sync_bundle_if_needed

# The first upgrade handles an already-enabled Forms installation. Enabling
# handles a fresh or previously disabled installation. The final upgrade is
# intentionally idempotent and catches migrations registered during enable.
php "${NEXTCLOUD_ROOT}/occ" upgrade
php "${NEXTCLOUD_ROOT}/occ" app:enable forms
php "${NEXTCLOUD_ROOT}/occ" upgrade

installed_version="$(php "${NEXTCLOUD_ROOT}/occ" config:app:get forms installed_version)"
if [[ "${installed_version}" != "${BUNDLE_VERSION}" ]]; then
	echo "Forms installation version ${installed_version:-<empty>} does not match bundled version ${BUNDLE_VERSION}." >&2
	exit 1
fi

printf '%s\n' "${BUNDLE_REVISION}" > "${REVISION_MARKER}"
echo "Bundled Forms ${BUNDLE_VERSION} (${BUNDLE_REVISION}) is ready."
