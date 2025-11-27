/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ASSET_MEDIA_PROXY_BASE, ASSET_TYPE_EXTRACTOR, AssetInfo, AssetSource, AssetType, ATTACHMENT_MEDIA_PROXY_BASE, AvatarDecoration, CDN_BASE, Collectible, CollectibleType, EQUICORD_BASE, EQUICORD_IMAGES_BASE, IMAGE_EXT_1_DOMAIN_BASE, IMAGE_EXT_2_DOMAIN_BASE, Nameplate, ParsedFile, ParsedURL, PRIMARY_DOMAIN_BASE, ProfileEffect, RESERVED_NAMES, TENOR_BASE_1, TENOR_BASE_2, TWITTER_DOMAIN_BASE, VENCORD_BADGES_BASE, VENCORD_BASE, WIKIMEDIA_DOMAIN_BASE } from "./definitions";

function toProfileEffect(data: any): ProfileEffect {
    return {
        type: CollectibleType.PROFILE_EFFECT,
        id: data.id,
        sku_id: data.sku_id,
        name: data.name,
        title: data.title,
        description: data.description,
        accessibilityLabel: data.accessibilityLabel,
        thumbnailPreviewSrc: data.thumbnailPreviewSrc,
        reducedMotionSrc: data.reducedMotionSrc,
        effects: data.effects.map((effect: any) => ({ src: effect.src })),
    };
}

function toNameplate(data: any): Nameplate {
    return {
        type: CollectibleType.NAMEPLATE,
        id: data.id,
        sku_id: data.sku_id,
        name: data.name,
        asset: data.asset,
        label: data.label,
        palette: data.palette,
    };
}

function toAvatarDecoration(data: any): AvatarDecoration {
    return {
        type: CollectibleType.AVATAR_DECORATION,
        id: data.id,
        sku_id: data.sku_id,
        name: data.name,
        asset: data.asset,
        label: data.label,
    };
}

/**
 * Prune collectible data to keep relevant attributes.
 */
export function sanitizeCollectible(data: any): Collectible | null {
    switch (data?.type) {
        case CollectibleType.AVATAR_DECORATION:
            return toAvatarDecoration(data);

        case CollectibleType.PROFILE_EFFECT:
            return toProfileEffect(data);

        case CollectibleType.NAMEPLATE:
            return toNameplate(data);

        default:
            return null;
    }
}

/**
 * Escapes characters in a string that have a special meaning in a regular expression.
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitize a file name by replacing invalid characters with underscores.
 */
export function sanitizeFilename(filename: string, {
    allowUnicode = true,
    allowSpaces = false,
    replacement = "-",
    useFallback = false,
    splitExtension = false
}: {
    allowUnicode?: boolean;
    allowSpaces?: boolean;
    replacement?: string;
    useFallback?: boolean;
    splitExtension?: boolean;
}): string | null {
    let sanitized = parseFile(splitExtension ? filename : filename.replaceAll(".", replacement)).baseName;

    sanitized = sanitized
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, replacement) // windows-reserved characters
        .replace(/\.\./g, replacement) // path traversal
        .replace(/[/\\]/g, replacement) // path separators
        .replace(/^\.+/, replacement) // leading dots
        .replace(/\.+$/g, replacement) // trailing dots
        .replace(/^[A-Za-z]:/g, replacement) // Windows drive letters (C:, D:, etc.)
        .replace(/^~/, replacement) // Unix home directory
        .replace(/[\t\n\r]+/g, replacement); // whitespace

    if (!allowSpaces) {
        sanitized = sanitized.replace(/\s+/g, replacement); // spaces
    }

    if (!allowUnicode) {
        sanitized = sanitized.replace(/[^\x00-\x7F]/g, replacement);
    }

    if (RESERVED_NAMES.includes(sanitized.toUpperCase())) {
        sanitized = "";
    }

    const escapedReplacement = escapeRegExp(replacement);

    sanitized = sanitized
        .replace(new RegExp(`${escapedReplacement}+`, "g"), replacement) // consecutive replacements
        .replace(new RegExp(`^${escapedReplacement}+|${escapedReplacement}+$`, "g"), ""); // leading/trailing replacements

    return sanitized || (useFallback ? "discord-download" : null);
}

/**
 * Check if a file size in bytes exceeds a given threshold in megabytes.
 */
export function fileThreshold(size: number | null, threshold: number): boolean {
    return !size || size > threshold * 1024 * 1024;
}

export function SVG2URL(svg: SVGElement): string {
    const svgClone = svg.cloneNode(true) as SVGElement;
    const originalElements = [svg, ...Array.from(svg.children)];
    const clonedElements = [svgClone, ...Array.from(svgClone.children)];

    originalElements.forEach((originalElement, index) => {
        const clonedElement = clonedElements[index] as SVGElement;
        const computedStyle = window.getComputedStyle(originalElement);
        const stylesToInline = ["fill", "stroke", "color"];

        stylesToInline.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop).trim();

            if (value && value !== "none") {
                clonedElement.setAttribute(prop, value);
            }
        });
    });

    const svgString = new XMLSerializer().serializeToString(svgClone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

    return url;
}

/** Determine the source of an asset based on its URL. */
export function getAssetSource(url: URL): AssetSource {
    if (url.protocol === "data:" && url.pathname.startsWith("image/svg+xml")) {
        return AssetSource.DATA_SVG;
    }

    if (["canary.discord.com", "ptb.discord.com"].includes(url.host)) {
        url.host = "discord.com";
    }

    const isMediaProxy = url.origin === ASSET_MEDIA_PROXY_BASE.origin;
    const isAttachmentMediaProxy = isMediaProxy && url.pathname.startsWith(ATTACHMENT_MEDIA_PROXY_BASE.pathname);
    const isAssetMediaProxy = isMediaProxy && !isAttachmentMediaProxy;
    const isPrimaryDomain = url.origin === PRIMARY_DOMAIN_BASE.origin;
    const isCDN = url.origin === CDN_BASE.origin;
    const isImageExt1 = url.origin === IMAGE_EXT_1_DOMAIN_BASE.origin;
    const isImageExt2 = url.origin === IMAGE_EXT_2_DOMAIN_BASE.origin;
    const isImageExt = isImageExt1 || isImageExt2;
    const isWikimedia = url.origin === WIKIMEDIA_DOMAIN_BASE.origin;
    const isTwitter = url.origin === TWITTER_DOMAIN_BASE.origin;
    const isTenor = [TENOR_BASE_1.origin, TENOR_BASE_2.origin].includes(url.origin);
    const isVencord = [VENCORD_BASE.origin, VENCORD_BADGES_BASE.origin].includes(url.origin);
    const isEquicord = [EQUICORD_BASE.origin, EQUICORD_IMAGES_BASE.origin].includes(url.origin);

    if (isAttachmentMediaProxy) {
        return AssetSource.ATTACHMENT_MEDIA_PROXY;
    } else if (isAssetMediaProxy) {
        return AssetSource.ASSET_MEDIA_PROXY;
    } else if (isPrimaryDomain) {
        return AssetSource.PRIMARY_DOMAIN;
    } else if (isCDN) {
        return AssetSource.CDN;
    } else if (isImageExt) {
        return AssetSource.EXTERNAL_IMAGE_PROXY;
    } else if (isWikimedia) {
        return AssetSource.WIKIMEDIA;
    } else if (isTwitter) {
        return AssetSource.TWITTER;
    } else if (isTenor) {
        return AssetSource.TENOR;
    } else if (isVencord || isEquicord) {
        return AssetSource.VENCORD;
    } else {
        return AssetSource.UNKNOWN;
    }
}

/**
 * Retrieve information about a file path by parsing its parts.
 */
export function parseFile(filePath: string): ParsedFile {
    const parts = filePath.split(/[\\/]/);
    const fileNameWithExtra = parts.pop() as string;
    let fileNameWithExtraDecoded = fileNameWithExtra;

    while (fileNameWithExtraDecoded.includes("%25")) {
        fileNameWithExtraDecoded = decodeURIComponent(fileNameWithExtraDecoded);
    }

    fileNameWithExtraDecoded = decodeURIComponent(fileNameWithExtraDecoded);

    const posColon = fileNameWithExtraDecoded.indexOf(":", 1);
    const fileNameWithoutExtra = posColon === -1 ? fileNameWithExtraDecoded : fileNameWithExtraDecoded.slice(0, posColon);

    const path = parts.join("/") + "/";
    const posDot = fileNameWithoutExtra.lastIndexOf(".");

    if (fileNameWithoutExtra === "" || posDot < 1) {
        return {
            path,
            pathEnd: fileNameWithExtra,
            baseName: fileNameWithoutExtra,
            extension: null,
        };
    }

    return {
        path,
        pathEnd: fileNameWithExtra,
        baseName: fileNameWithoutExtra.slice(0, posDot),
        extension: fileNameWithoutExtra.slice(posDot + 1).toLowerCase(),
    };
}

/**
 * Retrieve information about a URL by parsing its parts.
 */
export function parseURL(url: string): ParsedURL {
    const parsed = new URL(url);
    const source = getAssetSource(parsed);

    const { path, pathEnd, baseName, extension } =
        source === AssetSource.UNKNOWN
            ? { path: "", pathEnd: "", baseName: "", extension: "" }
            : source === AssetSource.DATA_SVG
                ? { path: url, pathEnd: "", baseName: "", extension: "svg" }
                : parseFile(parsed.pathname);

    const params = Array.from(parsed.searchParams.entries()).reduce(
        (acc, [key, value]) => {
            if (["ex", "is", "hm"].includes(key)) {
                acc.expiry[key] = value;
            } else {
                acc.other[key] = value;
            }

            return acc;
        }, { expiry: {}, other: {} } as { expiry: Record<string, string>, other: Record<string, string>; }
    );

    return {
        url: parsed,
        path,
        pathEnd,
        baseName,
        extension,
        params,
        source
    };
}

/**
 * Get the current date and time formatted as a string.
 */
export function getFormattedNow(): string {
    return new Date().toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    }).replace(",", "");
}

export function parseDiscordURLs(url: ParsedURL, asset: AssetInfo) {
    const detected = url.url.href.match(ASSET_TYPE_EXTRACTOR);
    const detectedPrimary = detected?.[1] ?? "";
    const detectedSecondary = detected?.[2] ?? "";
    const detectedTertiary = detected?.[3] ?? "";

    if (detectedPrimary === "attachments") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ATTACHMENT_MEDIA_PROXY;
        asset.classifier = asset.mime;
    } else if (detectedPrimary === "emojis") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.CUSTOM_EMOJI;
    } else if (detectedPrimary === "badge-icons") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.PROFILE_BADGE;
    } else if (detectedPrimary === "clan-badges") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.CLAN_BADGE;
    } else if (detectedPrimary === "role-icons") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.CUSTOM_ROLE_ICON;
    } else if (detectedPrimary === "discovery-splashes") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.GUILD_DISCOVERY_SPLASH;
    } else if (detectedPrimary === "splashes") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.GUILD_INVITE_SPLASH;
    } else if (detectedPrimary === "banners") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.GUILD_BANNER;
    } else if (detectedPrimary === "icons") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.GUILD_ICON;
    } else if (detectedPrimary === "avatar-decoration-presets") {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.AVATAR_DECORATION;
        asset.animatable = true; // Avatar decorations always have animated variants.
    } else if (detectedPrimary === "avatars" || (detectedPrimary === "guilds" && detectedSecondary === "avatars")) {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.USER_AVATAR;
    } else if (detectedPrimary === "banners" || (detectedPrimary === "guilds" && detectedSecondary === "banners")) {
        url.url.host = ASSET_MEDIA_PROXY_BASE.host;
        url.source = AssetSource.ASSET_MEDIA_PROXY;
        asset.classifier = AssetType.USER_BANNER;
    } else if (detectedPrimary === "assets/collectibles/nameplates") {
        url.url.host = CDN_BASE.host;
        url.source = AssetSource.CDN;
        asset.classifier = AssetType.NAMEPLATE;
        asset.animatable = true; // Nameplates always have animated variants.
        asset.alias ??= detectedTertiary ?? "nameplate";
    } else if (detectedPrimary === "assets/profile_effects/effects") {
        url.url.host = CDN_BASE.host;
        url.source = AssetSource.CDN;
        ![AssetType.PROFILE_EFFECT_PRIMARY, AssetType.PROFILE_EFFECT_SECONDARY, AssetType.PROFILE_EFFECT_THUMBNAIL].includes(asset.classifier as any) && (asset.classifier = AssetType.PROFILE_EFFECT_THUMBNAIL);
        asset.animatable = !(asset.classifier === AssetType.PROFILE_EFFECT_THUMBNAIL);
        asset.alias ??= detectedTertiary ?? "profile-effect";
    } else if (detectedPrimary === "stickers") {
        if (url.extension === "gif") {
            url.url.host = ASSET_MEDIA_PROXY_BASE.host;
            url.source = AssetSource.ASSET_MEDIA_PROXY;
            asset.classifier = AssetType.GIF_STICKER;
            asset.animatable = true;
        } else if (url.extension === "webp") {
            if (asset.animatable) {
                url.url.host = ASSET_MEDIA_PROXY_BASE.host;
                url.source = AssetSource.ASSET_MEDIA_PROXY;
                asset.classifier = AssetType.GIF_STICKER;
            } else {
                // There is no way to know if a static WEBP sticker
                // link is sourced from an APNG, PNG, or GIF sticker.
            }
        } else if (url.extension === "png") {
            if (asset.animatable) {
                url.url.host = ASSET_MEDIA_PROXY_BASE.host;
                url.source = AssetSource.ASSET_MEDIA_PROXY;
                asset.classifier = AssetType.APNG_STICKER;
            } else {
                // There is no way to know if a static PNG sticker
                // link is sourced from an APNG, PNG, or GIF sticker.
            }
        } else if (url.extension === "jpg") {
            // There is no way to know if a JPG sticker link
            // is sourced from an APNG, PNG, or GIF sticker.
        }
    }
}
