#!/bin/bash

# SPDX-FileCopyrightText: 2026 turingkeystone
# SPDX-License-Identifier: AGPL-3.0-or-later

set -Eeuo pipefail

readonly NEXTCLOUD_ROOT="${NEXTCLOUD_ROOT:-/var/www/html}"
readonly BUNDLED_FORMS_ROOT="${BUNDLED_FORMS_ROOT:-/opt/nextcloud-bundles/forms}"
readonly CUSTOM_APPS_ROOT="${NEXTCLOUD_ROOT}/custom_apps"
readonly LIVE_APP_ROOT="${CUSTOM_APPS_ROOT}/forms"
readonly BACKUP_APP_ROOT="${CUSTOM_APPS_ROOT}/.forms-bundle.previous"

[[ -f "${BUNDLED_FORMS_ROOT}/appinfo/info.xml" ]] || {
	echo "The bundled Forms application is missing." >&2
	exit 1
}

app_id="$(php -r '$xml = simplexml_load_file($argv[1]); if ($xml === false) { exit(1); } echo (string)$xml->id;' "${BUNDLED_FORMS_ROOT}/appinfo/info.xml")"
[[ "${app_id}" == "forms" ]] || {
	echo "Refusing to install an application whose id is not forms." >&2
	exit 1
}

mkdir -p "${CUSTOM_APPS_ROOT}"
find "${CUSTOM_APPS_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '.forms-bundle.staging.*' -exec rm -rf -- {} +
rm -rf -- "${BACKUP_APP_ROOT}"

staging_root="$(mktemp -d "${CUSTOM_APPS_ROOT}/.forms-bundle.staging.XXXXXX")"
backup_created=false

restore_on_error() {
	local status=$?
	if (( status != 0 )); then
		rm -rf -- "${staging_root}"
		if [[ "${backup_created}" == true && ! -e "${LIVE_APP_ROOT}" && -d "${BACKUP_APP_ROOT}" ]]; then
			mv "${BACKUP_APP_ROOT}" "${LIVE_APP_ROOT}"
		fi
	fi
	exit "${status}"
}
trap restore_on_error EXIT

cp -a "${BUNDLED_FORMS_ROOT}/." "${staging_root}/"

staged_id="$(php -r '$xml = simplexml_load_file($argv[1]); if ($xml === false) { exit(1); } echo (string)$xml->id;' "${staging_root}/appinfo/info.xml")"
[[ "${staged_id}" == "forms" ]] || {
	echo "The staged application failed validation." >&2
	exit 1
}

if [[ -e "${LIVE_APP_ROOT}" ]]; then
	mv "${LIVE_APP_ROOT}" "${BACKUP_APP_ROOT}"
	backup_created=true
fi

mv "${staging_root}" "${LIVE_APP_ROOT}"
rm -rf -- "${BACKUP_APP_ROOT}"
backup_created=false
trap - EXIT
