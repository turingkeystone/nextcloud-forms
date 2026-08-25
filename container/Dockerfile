# syntax=docker/dockerfile:1

# SPDX-FileCopyrightText: 2026 turingkeystone
# SPDX-License-Identifier: AGPL-3.0-or-later

ARG AIO_NEXTCLOUD_IMAGE=ghcr.io/nextcloud-releases/aio-nextcloud:latest
FROM ${AIO_NEXTCLOUD_IMAGE}

ARG FORMS_SOURCE_REVISION=unknown
ARG FORMS_VERSION=unknown

LABEL org.opencontainers.image.source="https://github.com/turingkeystone/nextcloud-forms" \
	org.opencontainers.image.description="Nextcloud AIO with the bundled custom Forms build" \
	org.opencontainers.image.revision="${FORMS_SOURCE_REVISION}" \
	org.opencontainers.image.version="${FORMS_VERSION}"

ENV BUNDLED_FORMS_REVISION="${FORMS_SOURCE_REVISION}"

RUN test -f /entrypoint.sh \
	&& cp /entrypoint.sh /entrypoint.aio.sh \
	&& mkdir -p /opt/nextcloud-bundles/forms /usr/src/nextcloud/custom_apps/forms

COPY --chown=33:0 dist/forms/ /opt/nextcloud-bundles/forms/
COPY --chown=33:0 dist/forms/ /usr/src/nextcloud/custom_apps/forms/
COPY --chmod=0555 container/sync-forms-bundle.sh /sync-forms-bundle.sh
COPY --chmod=0555 container/entrypoint-with-forms.sh /entrypoint.sh

RUN php -r '$xml = simplexml_load_file("/opt/nextcloud-bundles/forms/appinfo/info.xml"); if ($xml === false || (string)$xml->id !== "forms") { fwrite(STDERR, "Invalid Forms bundle\n"); exit(1); }' \
	&& bash -n /entrypoint.sh \
	&& bash -n /sync-forms-bundle.sh
