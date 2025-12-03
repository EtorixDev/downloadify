/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NativeSettings } from "@main/settings";
import { dialog } from "electron";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

import { assetAvailability, AssetInfo, AssetSource, AssetType, DownloadResponse, mimeExtensions, ParsedURL, TENOR_AWEBP_ID, TENOR_BASE_1, TENOR_GIF_ID, TENOR_MP4_ID, TENOR_PNG_ID, TENOR_WEBM_ID, TENOR_WEBP_ID } from "./utils/definitions";
import { parseDiscordURLs, parseFile, parseURL, sanitizeFilename } from "./utils/misc";

NativeSettings.store.plugins.Downloadify ??= {};

/** Ask the user to select a directory to save files. */
export async function setDownloadDirectory(): Promise<void> {
    const result = await dialog.showOpenDialog({
        properties: ["openDirectory"]
    });

    result.filePaths[0] && (NativeSettings.store.plugins.Downloadify.defaultDirectory = result.filePaths[0]);
}

/** Clear the saved default download directory. */
export function clearDownloadDirectory(): void {
    NativeSettings.store.plugins.Downloadify.defaultDirectory = "";
}

/** Get the saved default download directory, if any. */
export function getDownloadDirectory(): string | null {
    return NativeSettings.store.plugins.Downloadify.defaultDirectory || null;
}

/** Check if a file exists at a given path. */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/** Ask the user to select a file name and location to save a file. */
async function getFilePath(fileName: string, fileTypes: string[] | null): Promise<string | null> {
    const filters = fileTypes?.map(ext => ({
        name: ext.toUpperCase(),
        extensions: [ext]
    })) ?? [];

    if (!fileTypes?.length) {
        filters.push({ name: "All Files", extensions: ["*"] });
    }

    const result = await dialog.showSaveDialog({
        title: "Save File",
        defaultPath: fileName + (fileTypes ? `.${fileTypes[0]}` : ""),
        buttonLabel: "Save",
        properties: ["createDirectory"],
        filters
    });

    return result.filePath ?? null;
}

/** Download a file from a URL to a local file path. */
async function downloadURL(url: string, filePath: string): Promise<boolean> {
    const response = await fetch(url);

    if (!response.ok) {
        return false;
    }

    if (!response.body) {
        return false;
    }

    const readableStream = Readable.fromWeb(response.body as any);
    const fileWriteStream = fs.createWriteStream(filePath);
    readableStream.pipe(fileWriteStream);
    await finished(fileWriteStream);

    return true;
}

/** Get the content type of a file at a URL. */
async function queryContentType(url: string): Promise<string | null | undefined> {
    const response = await fetch(url, { method: "HEAD" });

    if (!response.ok) {
        return null;
    }

    return response.headers.get("content-type") ?? undefined;
}

/** Construct a URL for one of Discord's official domains. */
function buildDiscordURL(
    urls: { if: { [ext: string]: string; }, else: string; },
    url: ParsedURL,
    asset: AssetInfo
) {
    const availableExtensions = assetAvailability[url.source]?.[asset.classifier ?? ""];
    const onlyAnimated = !availableExtensions ? false : ((availableExtensions.animated?.length ?? 0) > 0 && (availableExtensions.static?.length ?? 0) === 0);
    const onlyStatic = !availableExtensions ? false : ((availableExtensions.static?.length ?? 0) > 0 && (availableExtensions.animated?.length ?? 0) === 0);
    const extensions: string[] = availableExtensions?.[((asset.animatable || onlyAnimated) && !onlyStatic) ? "animated" : "static"] ?? [];

    extensions.forEach(ext => {
        const isVideo = ["video/mp4", "video/webm"].includes(asset.mime ?? "");
        const resolvedExt = ext.replace("apng", "png").replace("awebp", "webp");
        let baseURL: string | undefined;

        if ([AssetSource.ASSET_MEDIA_PROXY, AssetSource.ATTACHMENT_MEDIA_PROXY, AssetSource.EXTERNAL_IMAGE_PROXY].includes(url.source)) {
            const isVideo = ["video/mp4", "video/webm"].includes(asset.mime ?? "");

            if (url.source === AssetSource.ASSET_MEDIA_PROXY && !isVideo) {
                baseURL = url.url.origin + url.path + url.baseName + `.${resolvedExt}`;
            } else {
                baseURL = url.url.origin + url.path + url.pathEnd;
            }

            const authParams = url.params.expiry;
            const newURL = new URL(baseURL);

            Object.entries(authParams).forEach(([key, value]) => {
                newURL.searchParams.append(key, value);
            });

            if (isVideo || [AssetSource.ATTACHMENT_MEDIA_PROXY, AssetSource.EXTERNAL_IMAGE_PROXY].includes(url.source)) {
                // Attachments on the media proxy and the external image proxy use the format query
                // parameter to retrieve alternate formats instead of changing the file extension
                // directly like assets on the media proxy do as seen above. Videos files also
                // offer thumbnails through the format parameter.
                if (url.extension !== ext) {
                    newURL.searchParams.append("format", resolvedExt.replace("jpg", "jpeg"));
                }
            }

            if (url.source !== AssetSource.ATTACHMENT_MEDIA_PROXY) {
                // Attachments on the media proxy do not support resizing but assets
                // on the media proxy do, and the external image proxy does as well.
                newURL.searchParams.append("size", "4096");
            }

            if (ext === "awebp" && asset.animatable) {
                newURL.searchParams.append("animated", "true");
            } else if (ext === "png" && asset.animatable) {
                newURL.searchParams.append("passthrough", "false");
            }

            if (["webp", "awebp"].includes(ext)) {
                newURL.searchParams.append("lossless", "true");
            }

            baseURL = newURL.href;
        } else if (url.source === AssetSource.CDN) {
            if (asset.classifier === AssetType.NAMEPLATE) {
                baseURL = url.url.origin + url.path;

                if (ext === "apng") {
                    baseURL += "img.png";
                } else if (ext === "webm") {
                    baseURL += "asset.webm";
                } else if (ext === "png") {
                    baseURL += "static.png";
                } else if (ext === "webp") {
                    baseURL += "img.png?format=webp";
                } else if (ext === "jpg") {
                    baseURL += "img.png?format=jpeg";
                }
            } else if ([AssetType.PROFILE_EFFECT_THUMBNAIL, AssetType.PROFILE_EFFECT_PRIMARY, AssetType.PROFILE_EFFECT_SECONDARY].includes(asset.classifier as any)) {
                if (ext === "webp") {
                    url.url.searchParams.append("format", "webp");
                } else if (ext === "jpg") {
                    url.url.searchParams.append("format", "jpeg");
                }

                baseURL = url.url.href;
            } else if (asset.classifier === AssetType.LOTTIE_STICKER) {
                baseURL = url.url.href;
            } else if (isVideo || asset.classifier === AssetType.GENERIC_STATIC) {
                const newURL = new URL(url.url.href);

                if (url.extension !== ext) {
                    newURL.searchParams.append("format", resolvedExt.replace("jpg", "jpeg"));
                }

                baseURL = newURL.href;
            }
        }

        baseURL && (urls.if[ext] ??= baseURL);
    });
}

/** First step in downloading a file. */
export async function download(
    _: Electron.IpcMainInvokeEvent,
    asset: AssetInfo,
    allowUnicode: boolean,
): Promise<DownloadResponse> {
    const parsedPrimaryURL = parseURL(asset.urls.primary);
    let parsedSecondaryURL = asset.urls.secondary ? parseURL(asset.urls.secondary) : null;

    if (parsedSecondaryURL?.source === AssetSource.UNKNOWN) {
        parsedSecondaryURL = null;
        delete asset.urls.secondary;
    }

    if (parsedPrimaryURL.source === AssetSource.UNKNOWN) {
        return {
            toast: "Invalid Asset Source",
            type: "failure",
            logger: "warn",
            log: `[INVALID ASSET SOURCE 1]\n\n${JSON.stringify(parsedPrimaryURL)}\n\n${JSON.stringify(asset)}`,
            mod: 1250,
        };
    }

    asset.mime ??= await queryContentType(parsedPrimaryURL.url.href);
    ["image/gif", "video/mp4", "video/webm"].includes(asset.mime ?? "") && (asset.animatable = true);
    asset.classifier ??= asset.mime ?? "";

    const urls: { if: { [ext: string]: string; }, else: string; } = { if: {}, else: parsedPrimaryURL.url.href };

    if ([AssetSource.PRIMARY_DOMAIN, AssetSource.VENCORD, AssetSource.DATA_SVG].includes(parsedPrimaryURL.source)) {
        parsedPrimaryURL.extension && (urls.if[parsedPrimaryURL.extension] ??= parsedPrimaryURL.url.href);
    } else if (parsedPrimaryURL.source === AssetSource.ATTACHMENT_MEDIA_PROXY) {
        buildDiscordURL(urls, parsedPrimaryURL, asset);
    } else if (parsedSecondaryURL?.source === AssetSource.CDN) {
        parseDiscordURLs(parsedSecondaryURL, asset);
        buildDiscordURL(urls, parsedSecondaryURL, asset);
    } else if (parsedSecondaryURL?.source === AssetSource.ASSET_MEDIA_PROXY) {
        parseDiscordURLs(parsedSecondaryURL, asset);
        buildDiscordURL(urls, parsedSecondaryURL, asset);
    } else if (parsedPrimaryURL?.source === AssetSource.ASSET_MEDIA_PROXY) {
        parseDiscordURLs(parsedPrimaryURL, asset);
        buildDiscordURL(urls, parsedPrimaryURL, asset);
    } else if (parsedSecondaryURL?.source === AssetSource.WIKIMEDIA) {
        let skipExternalProxy = false;

        if (parsedSecondaryURL.path.startsWith("/wikipedia/commons/thumb")) {
            const fullImage = parseURL(parsedSecondaryURL.url.href.replace("/thumb/", "/").split("/").slice(0, -1).join("/"));
            asset.alias = fullImage.baseName;

            if (fullImage.extension === "svg") {
                skipExternalProxy = true;
                // Wikimedia's backend will render SVGs as any of PNG, JPG or WEBP, at any requested resolution.
                // For consistency with Discord's max media proxy image sizing, we request 4096px here.
                const exts = assetAvailability[AssetSource.WIKIMEDIA]?.[AssetType.WIKIMEDIA_SVG]?.static ?? [];

                exts.forEach(ext => {
                    urls.if[ext] ??= ext === "svg" ? fullImage.url.href : parsedSecondaryURL.url.href.replace(/\/1200px-/, "/4096px-").replace(/\.svg\.\w+$/, `.${ext}`);
                });
            } else if (fullImage.extension) {
                urls.if[fullImage.extension] ??= fullImage.url.href;
            }
        }

        if (!skipExternalProxy && parsedPrimaryURL.source === AssetSource.EXTERNAL_IMAGE_PROXY) {
            buildDiscordURL(urls, parsedPrimaryURL, asset);
        }
    } else if (parsedSecondaryURL?.source === AssetSource.TWITTER) {
        let skipExternalProxy = false;

        if (["/ext_tw_video_thumb", "/media"].some(prefix => parsedSecondaryURL.path.startsWith(prefix))) {
            skipExternalProxy = true;
            // Twitter's backend will render all image assets as PNG, JPG, or WEBP, at their source size.
            // We request the largest image version available, matching Discord's max media proxy image sizing.
            const exts = assetAvailability[AssetSource.TWITTER]?.[AssetType.TWITTER_IMAGE]?.static ?? [];

            exts.forEach(ext => {
                urls.if[ext] ??= parsedSecondaryURL.url.origin + parsedSecondaryURL.path + parsedSecondaryURL.baseName + (`?format=${ext}&name=4096x4096`);
            });
        }

        // /profile_images and /profile_banners do not support formatting, so defer to external image proxy.
        if (!skipExternalProxy && parsedPrimaryURL.source === AssetSource.EXTERNAL_IMAGE_PROXY) {
            buildDiscordURL(urls, parsedPrimaryURL, asset);
        }
    } else if (parsedPrimaryURL.source === AssetSource.CDN) {
        parseDiscordURLs(parsedPrimaryURL, asset);
        buildDiscordURL(urls, parsedPrimaryURL, asset);
    } else if (parsedPrimaryURL.source === AssetSource.TENOR) {
        const tenorID = parsedPrimaryURL.path.replaceAll("/", "").slice(0, -2);
        const exts = assetAvailability[AssetSource.TENOR]?.[AssetType.TENOR_MEDIA]?.animated ?? [];

        exts.forEach(ext => {
            urls.if[ext] ??= ext === "gif" ? `${TENOR_BASE_1}/${tenorID}${TENOR_GIF_ID}/tenor.gif`
                : ext === "mp4" ? `${TENOR_BASE_1}/${tenorID}${TENOR_MP4_ID}/tenor.mp4`
                    : ext === "webm" ? `${TENOR_BASE_1}/${tenorID}${TENOR_WEBM_ID}/tenor.webm`
                        : ext === "png" ? `${TENOR_BASE_1}/${tenorID}${TENOR_PNG_ID}/tenor.png`
                            : ext === "webp" ? `${TENOR_BASE_1}/${tenorID}${TENOR_WEBP_ID}/tenor.webp`
                                : ext === "awebp" ? `${TENOR_BASE_1}/${tenorID}${TENOR_AWEBP_ID}/tenor.webp`
                                    : "";
        });
    } else if (parsedPrimaryURL.source === AssetSource.EXTERNAL_IMAGE_PROXY) {
        buildDiscordURL(urls, parsedPrimaryURL, asset);
    } else {
        return {
            toast: "Invalid Asset Source",
            type: "failure",
            logger: "warn",
            log: `[INVALID ASSET SOURCE 2]\n\n${JSON.stringify(parsedPrimaryURL)}` + (parsedSecondaryURL ? `\n\n${JSON.stringify(parsedSecondaryURL)}` : "") + `\n\n${JSON.stringify(asset)}`,
            mod: 1250,
        };
    }

    let baseName = (asset.alias
        ? sanitizeFilename(asset.alias, { allowUnicode, allowSpaces: false, replacement: "_", useFallback: true })
        : parsedPrimaryURL.baseName
            ? sanitizeFilename(parsedPrimaryURL.baseName, { allowUnicode, allowSpaces: false, replacement: "_", useFallback: true })
            : parsedSecondaryURL?.baseName
                ? sanitizeFilename(parsedSecondaryURL.baseName, { allowUnicode, allowSpaces: false, replacement: "_", useFallback: true })
                : "discord-download") || "discord-download";

    let builtPath: string | null = null;
    let chosenExtension: string | null = null;
    const defaultDirectory = getDownloadDirectory();

    if (defaultDirectory) {
        let primaryExtension = parsedPrimaryURL.extension;
        const assumedExtension = ((!primaryExtension && !!asset.mime) && mimeExtensions[asset.mime]?.[0]) || null;
        assumedExtension && (primaryExtension = assumedExtension);
        builtPath = `${defaultDirectory}${path.sep}${baseName}${primaryExtension ? `.${primaryExtension}` : ""}`;

        if (builtPath.length > 250) {
            const excess = builtPath.length - 250;
            baseName = baseName.slice(0, -(excess));
            builtPath = `${defaultDirectory}${path.sep}${baseName}${primaryExtension ? `.${primaryExtension}` : ""}`;
        }

        for (let num = 1; await fileExists(builtPath); num++) {
            builtPath = `${defaultDirectory}${path.sep}${baseName}-${num}${primaryExtension ? `.${primaryExtension}` : ""}`;
        }
    } else {
        const extensions = Object.keys(urls.if);
        (!extensions.length && parsedPrimaryURL.extension) && (extensions.push(parsedPrimaryURL.extension));
        const assumedExtension = ((!extensions.length && !!asset.mime) && mimeExtensions[asset.mime]?.[0]) || null;
        assumedExtension && (extensions.push(assumedExtension));
        builtPath = await getFilePath(baseName, extensions.length ? extensions : parsedPrimaryURL.extension ? [parsedPrimaryURL.extension] : null);

        if (!builtPath) {
            return {
                toast: "Download Canceled",
                type: "message",
                logger: "info",
                log: "[SAVE DIALOGUE CLOSED / DOWNLOAD CANCELED]",
                mod: 1250,
            };
        } else if (builtPath.length > 255) {
            return {
                toast: "File Path Too Long",
                type: "failure",
                logger: "warn",
                log: `[FILE PATH TOO LONG]\n\n${builtPath}`,
                mod: 1250,
            };
        }

        const chosenFile = parseFile(builtPath);
        chosenExtension = chosenFile.extension || "";
        const resolvedExtension = (chosenExtension || "").replace("apng", "png").replace("awebp", "webp");

        if (resolvedExtension) {
            const extReplacer = new RegExp(`\\.${chosenExtension}(?!.*\\.${chosenExtension})`, "i");
            builtPath = builtPath.replace(extReplacer, `.${resolvedExtension}`);
        }
    }

    const resolvedPath = path.resolve(builtPath);

    if (resolvedPath !== builtPath) {
        // Traversal Attempted. Shouldn't be possible
        // due to sanitization, but just in case.
        return {
            toast: "Invalid File Path",
            type: "failure",
            logger: "warn",
            log: `[INVALID FILE PATH]\n\n${builtPath}\n\n${resolvedPath}`,
            mod: 1250,
        };
    }

    let success = false;
    const resolvedURL = (chosenExtension ? urls.if[chosenExtension] : urls.else) ?? urls.else;

    try {
        success = await downloadURL(resolvedURL, builtPath);
    } catch (error) {
        return {
            toast: "Download Errored",
            type: "failure",
            logger: "error",
            log: `[DOWNLOAD ERRORED]\n\n${builtPath}\n\n${resolvedURL}\n\n${JSON.stringify(asset)}\n\n${JSON.stringify(error)}`,
            mod: 1250,
        };
    }

    if (success) {
        return {
            toast: "Download Finished",
            type: "success",
            logger: "info",
            log: `[DOWNLOAD FINISHED]\n\n${builtPath}\n\n${resolvedURL}`,
            mod: 1000,
        };
    } else {
        return {
            toast: "Download Failed",
            type: "failure",
            logger: "error",
            log: `[DOWNLOAD FAILED]\n\n${builtPath}\n\n${resolvedURL}\n\n${JSON.stringify(asset)}`,
            mod: 1250,
        };
    }
}
