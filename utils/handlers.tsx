/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ImageIcon } from "@components/index";
import { copyWithToast } from "@utils/index";
import { ConnectedAccount, GuildSticker, Sticker } from "@vencord/discord-types";
import { StickerFormatType } from "@vencord/discord-types/enums";
import { ContextMenuApi, GuildMemberStore, GuildRoleStore, GuildStore, Menu, SelectedGuildStore, showToast, StickersStore, Toasts, UserProfileStore, UserStore } from "@webpack/common";
import { JSX } from "react";

import { settings } from "../settings";
import { ASSET_MEDIA_PROXY_BASE, AssetInfo, AssetSource, AssetType, AttachmentFlags, AvatarDecoration, BadgeNames, CDN_BASE, ChannelContextMenuProps, ClanBadgeMessageContextMenuProps, CollectibleType, ConnectionExtrasProfileContextMenuProps, ConnectionIconProfileContextMenuProps, DownloadifyMember, DownloadifyUser, DownloadifyUserProfile, EmojiContextMenuProps, ExpandedModalDownloadProps, ExtractedCustomEmoji, ExtractedEmoji, ExtractedEmojis, GDMContextMenuProps, GuildContextMenuProps, HoverDownloadProps, InviteData, MessageContextMenuProps, Nameplate, OrbsPopoutShopImageContextMenuProps, PRIMARY_DOMAIN_BASE, ProfileBadgeContextMenuProps, ProfileEffect, QuestTileContextMenuProps, RoleIconMessageContextMenuProps, RoleIconProfileContextMenuProps, ShopCategoryHeaderContextMenuProps, ShopListingContextMenuProps, UnicodeEmojiData, UserContextMenuProps, VoiceMessageDownloadButtonProps } from "./definitions";
import { fileThreshold, getFormattedNow, parseURL, sanitizeFilename, SVG2URL } from "./misc";
import { ApplicationStore, CollectiblesData, d, defaultAssets, DownloadIcon, DownloadifyLogger, DownloadifyNative, extractEmojis, getConnection, getUnicodeEmojiData, getUnicodeEmojiPath, ImageAsIcon, InviteStore, joinOrCreateContextMenuGroup } from "./nonative";

export function MessageContextMenu(children: Array<any>, props: MessageContextMenuProps): void {
    if (!children?.length || !props?.message?.id) {
        return;
    }

    DownloadifyLogger.info(`[${getFormattedNow()}] [MESSAGE CONTEXT MENU OPENED]\n`, props);

    const mainMessage = props.message;
    const forwardedMessage = props.message.messageSnapshots?.[0]?.message;

    const message = forwardedMessage || mainMessage;
    const messageUnicodeReactionString = message.reactions?.map(reaction => !reaction.emoji.id ? reaction.emoji.name : "").join("") || "";
    const messageCustomReactionString = message.reactions?.map(reaction => reaction.emoji.id ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>` : "").join("") || "";
    const contentEmojis = extractEmojis(message.content + messageUnicodeReactionString + messageCustomReactionString);

    const inviteData = Array.from((message.codedLinks?.filter(link => link.type === "INVITE") || []).reduce((map, invite) => {
        const resolvedInvite = InviteStore.getInvite(invite.code);

        if (resolvedInvite && resolvedInvite.state === "RESOLVED") {
            const profile = resolvedInvite.profile ?? {};
            const gameIds = profile.game_application_ids ?? [];

            const games = gameIds.reduce((gameMap, id) => {
                const app = ApplicationStore.getApplication(id);

                if (app?.name && app.icon && !gameMap.has(app.name)) {
                    gameMap.set(app.name, {
                        name: app.name,
                        icon: app.icon,
                        splash: app.splash,
                        id: app.id,
                    });
                }

                return gameMap;
            }, new Map());

            const traitEmojis = profile.traits
                .map(trait => getUnicodeEmojiData(trait.emoji_name)?.emoji)
                .filter(Boolean)
                .join("");

            map.set(invite.code!, {
                icon: profile.icon_hash,
                banner: profile.custom_banner_hash,
                emojis: extractEmojis(JSON.stringify(profile) + traitEmojis),
                games: Array.from(games.values()),
                profile: profile,
            });
        }

        return map;
    }, new Map<string, InviteData>()).values());

    const embedData = (message.embeds || []).map(embed => {
        let data: any = {};

        if (["gifv", "video"].includes(embed.type)) {
            const tenor = embed.type === "gifv";
            data["type"] = tenor ? "TENOR" : "VIDEO";

            if (embed.video) {
                const parsedVideoURL = parseURL(embed.video.url);
                const parsedVideoURLIsTrusted = parsedVideoURL?.source && parsedVideoURL.source !== AssetSource.UNKNOWN;

                data["videos"] = [{
                    video: parsedVideoURLIsTrusted ? embed.video.url : embed.video.proxyURL || null,
                    videoExternal: embed.video.url || null,
                    videoProxy: embed.video.proxyURL || null,
                    videoMime: (embed.video as any)?.contentType || null
                }].filter(v => v.video);
            } else {
                data["videos"] = [];
            }

            if (!tenor && data["videos"].length === 0 && embed.thumbnail) {
                const parsedThumbnailURL = parseURL(embed.thumbnail.url);
                const parsedThumbnailURLIsTrusted = parsedThumbnailURL?.source && parsedThumbnailURL.source !== AssetSource.UNKNOWN;
                const thumbnailURL = (parsedThumbnailURLIsTrusted ? embed.thumbnail.url : embed.thumbnail.proxyURL) || null;
                data["thumbnail"] = thumbnailURL;
                data["thumbnailExternal"] = embed.thumbnail.url || null;
                data["thumbnailProxy"] = embed.thumbnail.proxyURL || null;
                data["thumbnailMime"] = (embed.thumbnail as any)?.contentType || null;
                data["thumbnailAnimated"] = (embed.thumbnail as any)?.srcIsAnimated ?? false;
            }
        } else if (embed.type === "image") {
            data["type"] = "IMAGE";

            if (embed.image) {
                const parsedImageURL = parseURL(embed.image.url);
                const parsedImageURLIsTrusted = parsedImageURL?.source && parsedImageURL.source !== AssetSource.UNKNOWN;

                data["images"] = [{
                    image: (parsedImageURLIsTrusted ? embed.image.url : embed.image.proxyURL) || null,
                    imageExternal: embed.image.url || null,
                    imageProxy: embed.image.proxyURL || null,
                    imageAnimated: (embed.image as any)?.srcIsAnimated ?? null,
                    imageMime: (embed.image as any)?.contentType || null
                }].filter(img => img.image);
            } else {
                data["images"] = [];
            }
        } else if (embed.type === "rich" || embed.type === "article") {
            data["type"] = "RICH";
            data["emojis"] = extractEmojis(JSON.stringify(embed));

            if (embed.author?.iconURL) {
                const parsedAuthorIconURL = parseURL(embed.author.iconURL);
                const parsedAuthorIconURLIsTrusted = parsedAuthorIconURL?.source && parsedAuthorIconURL.source !== AssetSource.UNKNOWN;
                const authorIconURL = (parsedAuthorIconURLIsTrusted ? embed.author.iconURL : embed.author.iconProxyURL) || null;
                data["author"] = authorIconURL;
                data["authorExternal"] = embed.author.iconURL || null;
                data["authorProxy"] = embed.author.iconProxyURL || null;
                data["authorMime"] = (embed.author as any)?.contentType || null;
            }

            if ((embed as any).footer?.iconURL) {
                const parsedFooterIconURL = parseURL((embed as any).footer.iconURL);
                const parsedFooterIconURLIsTrusted = parsedFooterIconURL?.source && parsedFooterIconURL.source !== AssetSource.UNKNOWN;
                const footerIconURL = (parsedFooterIconURLIsTrusted ? (embed as any).footer.iconURL : (embed as any).footer.iconProxyURL) || null;
                data["footer"] = footerIconURL;
                data["footerExternal"] = (embed as any).footer.iconURL || null;
                data["footerProxy"] = (embed as any).footer.iconProxyURL || null;
                data["footerMime"] = (embed as any)?.footer?.contentType || null;
            }

            if (embed.thumbnail?.url) {
                const parsedThumbnailURL = parseURL(embed.thumbnail.url);
                const parsedThumbnailURLIsTrusted = parsedThumbnailURL?.source && parsedThumbnailURL.source !== AssetSource.UNKNOWN;
                const thumbnailURL = (parsedThumbnailURLIsTrusted ? embed.thumbnail.url : embed.thumbnail.proxyURL) || null;
                data["thumbnail"] = thumbnailURL;
                data["thumbnailExternal"] = embed.thumbnail.url || null;
                data["thumbnailProxy"] = embed.thumbnail.proxyURL || null;
                data["thumbnailMime"] = (embed.thumbnail as any)?.contentType || null;
                data["thumbnailAnimated"] = (embed.thumbnail as any)?.srcIsAnimated ?? false;
            }

            const images = !!(embed as any).images?.length ? (embed as any).images : (embed).image ? [embed.image] : [];

            data["images"] = images.map((img: any) => {
                const parsedImageURL = parseURL(img.url);
                const parsedImageURLIsTrusted = parsedImageURL?.source && parsedImageURL.source !== AssetSource.UNKNOWN;

                return {
                    image: (parsedImageURLIsTrusted ? img.url : img.proxyURL) || null,
                    imageExternal: img.url || null,
                    imageProxy: img.proxyURL || null,
                    imageAnimated: img.srcIsAnimated ?? false,
                    imageMime: img.contentType || null
                };
            }).filter((img: any) => img.image);

            if (embed.video) {
                const parsedVideoURL = parseURL(embed.video.url);
                const parsedVideoURLIsTrusted = parsedVideoURL?.source && parsedVideoURL.source !== AssetSource.UNKNOWN;

                data["videos"] = [{
                    video: (parsedVideoURLIsTrusted ? embed.video.url : embed.video.proxyURL) || null,
                    videoExternal: embed.video.url || null,
                    videoProxy: embed.video.proxyURL || null,
                    videoMime: (embed.video as any)?.contentType || null
                }].filter(v => v.video);
            } else {
                data["videos"] = [];
            }
        } else {
            return null;
        }

        return { ...data };
    }).filter(Boolean) as Array<{
        type: "TENOR" | "VIDEO" | "IMAGE" | "RICH";
        emojis?: { unicode: Array<any>, custom: Array<any>; },
        videos?: {
            video?: string;
            videoExternal?: string | null;
            videoProxy?: string | null;
            videoMime?: string | null;
        }[];
        author?: string; authorProxy?: string | null; authorExternal?: string | null; authorMime?: string | null;
        footer?: string; footerProxy?: string | null; footerExternal?: string | null; footerMime?: string | null;
        images?: {
            image?: string;
            imageProxy?: string | null;
            imageExternal?: string | null;
            imageMime?: string | null;
            imageAnimated?: boolean | null;
        }[];
        thumbnail?: string;
        thumbnailProxy?: string | null;
        thumbnailExternal?: string | null;
        thumbnailMime?: string | null;
        thumbnailAnimated?: boolean | null;
    }>;

    const componentData: {
        type: "CONTAINER" | "FLAT";
        emojis: ExtractedEmojis;
        items: {
            type: "THUMBNAIL" | "MEDIA";
            thumbnail?: string | null;
            thumbnailProxy?: string | null;
            thumbnailExternal?: string | null;
            thumbnailMime?: string | null;
            thumbnailAnimated?: boolean;
            media?: string | null;
            mediaProxy?: string | null;
            mediaExternal?: string | null;
            mediaMime?: string | null;
            mediaAnimated?: boolean;
        }[];
    }[] = [];

    let currentNonContainerBatch: any[] = [];

    function extractDataFromComponentList(components: any[]): { items: any[]; emojis: ExtractedEmojis; } {
        const items: any[] = [];
        const queue = [...components];

        while (queue.length) {
            const component = queue.shift();
            if (!component) continue;

            if (component.type === 11) {
                const externalThumbnailURL = component.media!.url;
                const proxyThumbnailURL = component.media!.proxyUrl || null;
                const externalThumbnailURLParsed = !externalThumbnailURL ? null : parseURL(externalThumbnailURL);
                const thumbnailURL = externalThumbnailURLParsed?.source && externalThumbnailURLParsed.source !== AssetSource.UNKNOWN ? externalThumbnailURL : proxyThumbnailURL;
                const thumbnailMime = (component as any)?.media.contentType || null;
                const thumbnailAnimated = !!((component.media!.flags || 0) & AttachmentFlags.IS_ANIMATED);

                items.push({
                    type: "THUMBNAIL",
                    thumbnail: thumbnailURL,
                    thumbnailProxy: proxyThumbnailURL,
                    thumbnailExternal: externalThumbnailURL,
                    thumbnailMime,
                    thumbnailAnimated,
                });
            } else if (component.type === 12) {
                if (Array.isArray(component.items)) {
                    for (const item of component.items) {
                        const externalImageURL = item.media.url;
                        const proxyImageURL = item.media.proxyUrl || null;
                        const externalImageURLParsed = !externalImageURL ? null : parseURL(externalImageURL);
                        const mediaURL = externalImageURLParsed?.source && externalImageURLParsed.source !== AssetSource.UNKNOWN ? externalImageURL : proxyImageURL;
                        const mediaMime = (item as any)?.media.contentType || null;
                        const mediaAnimated = !!((item.media.flags || 0) & AttachmentFlags.IS_ANIMATED);

                        items.push({
                            type: "MEDIA",
                            media: mediaURL,
                            mediaProxy: proxyImageURL,
                            mediaExternal: externalImageURL,
                            mediaMime,
                            mediaAnimated,
                        });
                    }
                }
            }

            for (const key in component) {
                const value = component[key];
                if (!value || typeof value !== "object") continue;
                const toQueue: any[] = [];

                if (Array.isArray(value)) {
                    for (const subItem of value) {
                        if (subItem && typeof subItem === "object" && typeof subItem.type === "number") {
                            toQueue.push(subItem);
                        }
                    }
                } else {
                    if (typeof value.type === "number") {
                        toQueue.push(value);
                    }
                }

                queue.unshift(...toQueue);
            }
        }

        return {
            items,
            emojis: extractEmojis(JSON.stringify(components))
        };
    }

    const topLevelComponents = [...(message.components as any[] || [])];

    for (const component of topLevelComponents) {
        if (component.type === 17) {
            if (currentNonContainerBatch.length > 0) {
                const items = extractDataFromComponentList(currentNonContainerBatch);

                if (items.items.length || items.emojis.unicode.length || items.emojis.custom.length) {
                    componentData.push({ type: "FLAT", items: items.items, emojis: items.emojis });
                }

                currentNonContainerBatch = [];
            }

            const items = extractDataFromComponentList([component]);

            if (items.items.length || items.emojis.unicode.length || items.emojis.custom.length) {
                componentData.push({ type: "CONTAINER", items: items.items, emojis: items.emojis });
            }
        } else {
            currentNonContainerBatch.push(component);
        }
    }

    if (currentNonContainerBatch.length > 0) {
        const items = extractDataFromComponentList(currentNonContainerBatch);

        if (items.items.length || items.emojis.unicode.length || items.emojis.custom.length) {
            componentData.push({ type: "FLAT", items: items.items, emojis: items.emojis });
        }
    }

    const attachmentData = Array.from((message.attachments || []).map(attachment => {
        const hasVariants = (attachment as any).placeholder;
        const url = hasVariants ? attachment.proxy_url : attachment.url;

        return {
            url,
            mime: (attachment as any).contentType || null,
            size: attachment.size,
            title: (attachment as any).title || (attachment as any).filename || null,
            animated: !!(((attachment as any).flags ?? 0) & AttachmentFlags.IS_ANIMATED),
        };
    }));

    const allEmojis = {
        unicode: [...new Map([
            ...contentEmojis.unicode,
            ...inviteData.flatMap(data => data.emojis.unicode),
            ...componentData.flatMap(component => component.emojis.unicode),
            ...embedData.flatMap(data => data.emojis?.unicode ?? []),
        ].map(e => [e.emoji, e])).values()],
        custom: [...new Map([
            ...contentEmojis.custom,
            ...inviteData.flatMap(data => data.emojis.custom),
            ...componentData.flatMap(component => component.emojis.custom),
            ...embedData.flatMap(data => data.emojis?.custom ?? []),
        ].map(e => [e.id, e])).values()]
    };

    const favoriteableId = props.favoriteableId ?? null;
    const favoriteableNameCleaned = props.favoriteableName?.replaceAll(":", "") ?? "";

    const targetedEmoji = (props.favoriteableType === "emoji" && (
        (favoriteableId && allEmojis.custom.find(e => e.id === favoriteableId)) ||
        (favoriteableNameCleaned && allEmojis.unicode.find(e => e.aliases.includes(favoriteableNameCleaned)))
    )) || null;

    const targetedSticker = (props.favoriteableType === "sticker" && (
        message.stickerItems?.find(sticker => sticker.id === props.favoriteableId)
    )) || null;

    const targetElement = props.contextMenuAPIArguments?.[0].target as HTMLElement | null;
    const targetSRCParsed = !props.itemSrc ? null : new URL(props.itemSrc);
    const targetSRC = targetSRCParsed ? `${targetSRCParsed?.origin}${targetSRCParsed?.pathname}` : "";
    const targetProxyParsed = !props.itemSafeSrc ? null : new URL(props.itemSafeSrc);
    const targetProxy = targetProxyParsed ? `${targetProxyParsed?.origin}${targetProxyParsed?.pathname}` : "";

    const targetedEmbedMedia = embedData.reduce<{ primary?: string | null; secondary?: string | null; mime?: string | null; target?: string; } | null>((result, data) => {
        if (result) return result;

        const image = data.images?.find(img => img.imageProxy === targetProxy || img.imageProxy === targetSRC || img.imageExternal === targetSRC || img.imageExternal === targetProxy) || "";
        if (image) return { primary: image.image, mime: image.imageMime, target: "Image" };

        if (data.authorProxy === targetProxy || data.authorProxy === targetSRC || data.authorExternal === targetSRC || data.authorExternal === targetProxy) return { primary: data.author, mime: data.authorMime, target: "Author Icon" };
        if (data.footerProxy === targetProxy || data.footerProxy === targetSRC || data.footerExternal === targetSRC || data.footerExternal === targetProxy) return { primary: data.footer, mime: data.footerMime, target: "Footer Icon" };
        if (data.thumbnailProxy === targetProxy || data.thumbnailProxy === targetSRC || data.thumbnailExternal === targetSRC || data.thumbnailExternal === targetProxy) return { primary: data.thumbnail, mime: data.thumbnailMime, target: "Thumbnail" };
        // Discord does not always pass video data to the context menu
        // for embedded videos, so querying for the element is necessary.
        const videoElement = targetElement?.closest("[class*=embedVideo]")?.querySelector("video");
        const videoSrc = videoElement?.src || "";
        let video = data.videos?.find(v => v.videoProxy === videoSrc || v.videoExternal === videoSrc || v.videoProxy === targetProxy || v.videoProxy === targetSRC || v.videoExternal === targetSRC || v.videoExternal === targetProxy) || null;
        if (video) return { primary: video.video, mime: video.videoMime, target: (data.type === "VIDEO" || (data.type === "RICH" && videoSrc)) ? "Video" : "Tenor GIF" };

        return null;
    }, null);

    const targetedComponentMedia = componentData.reduce<{ primary?: string | null; secondary?: string | null; mime?: string | null; target?: string; } | null>((result, component) => {
        if (result) return result;

        const thumbnail = component.items.find(item => item.type === "THUMBNAIL" && (item.thumbnailProxy === targetProxy || item.thumbnailProxy === targetSRC || item.thumbnailExternal === targetSRC || item.thumbnailExternal === targetProxy)) || "";
        if (thumbnail) return { primary: thumbnail.thumbnail, mime: thumbnail.thumbnailMime, target: "Thumbnail" };

        const media = component.items.find(item => item.type === "MEDIA" && (item.mediaProxy === targetProxy || item.mediaProxy === targetSRC || item.mediaExternal === targetSRC || item.mediaExternal === targetProxy)) || "";
        if (media) return { primary: media.media, mime: media.mediaMime, target: "Media" };

        return null;
    }, null);

    const targetedAttachment = (attachmentData.find(attachment => {
        const attachmentURLParsed = new URL(attachment.url);
        const attachmentURL = `${attachmentURLParsed.origin}${attachmentURLParsed.pathname}`;
        const mediaItemURLParsed = !props.mediaItem?.url ? null : new URL(props.mediaItem?.url);
        const mediaItemURL = mediaItemURLParsed ? `${mediaItemURLParsed.origin}${mediaItemURLParsed.pathname}` : "";
        const mediaItemProxyParsed = !props.mediaItem?.proxyUrl ? null : new URL(props.mediaItem?.proxyUrl);
        const mediaItemProxyURL = mediaItemProxyParsed ? `${mediaItemProxyParsed.origin}${mediaItemProxyParsed.pathname}` : "";
        return attachmentURL === mediaItemURL || attachmentURL === mediaItemProxyURL || attachmentURL === targetSRC || attachmentURL === targetProxy;
    })) || null;

    // Discord does not pass invite data to the context menu, so querying for
    // the element is necessary to detect if it was the target of the context menu.
    const targetedInviteElement = (!!inviteData.length && targetElement?.closest("[class*=guildInviteContainer]")) || null;
    const targetedInviteBanner = (!!targetedInviteElement && Array.from(targetElement?.classList || []).some(cls => cls.includes("banner"))) || false;
    const targetedInviteIcon = (!!targetedInviteElement && Array.from(targetElement?.classList || []).some(cls => cls.includes("guildIconImage"))) || false;
    const targetedInviteGame = (!!targetedInviteElement && Array.from(targetElement?.classList || []).some(cls => cls.includes("gameIconImage"))) || false;

    const targetedInvite = ((targetedInviteBanner || targetedInviteIcon || targetedInviteGame) && inviteData.find(invite => {
        const targetedInviteElementName = targetedInviteElement?.querySelector("[class*=nameContainer] span")?.textContent || null;
        const targetedInviteElementOnline = targetedInviteElement?.querySelector("[class*=memberCount]:nth-of-type(1) div:nth-of-type(2)")?.textContent?.split(" ")[0] || null;
        const targetedInviteElementMembers = targetedInviteElement?.querySelector("[class*=memberCount]:nth-of-type(2) div:nth-of-type(2)")?.textContent?.split(" ")[0] || null;

        return (targetedInviteElementName && invite.profile?.name === targetedInviteElementName) &&
            (targetedInviteElementOnline && invite.profile?.online_count === Number(targetedInviteElementOnline.replace(/\D/g, ''))) &&
            (targetedInviteElementMembers && invite.profile?.member_count === Number(targetedInviteElementMembers.replace(/\D/g, '')));
    })) || null;

    const downloadifyItems: any[] = [];

    function getEmojiMenuItem(emoji: ExtractedEmoji, isTargeted: boolean = false, isSubmenuItem: boolean = false) {
        const isUnicodeEmoji = !(emoji as any).id;
        const isCustomEmoji = !isUnicodeEmoji;
        const isAnimated = isUnicodeEmoji ? false : (emoji as any).animated;
        const emojiURL = isCustomEmoji
            ? `${ASSET_MEDIA_PROXY_BASE.origin}/emojis/${(emoji as any).id}.${isAnimated ? "gif" : "png"}`
            : `${PRIMARY_DOMAIN_BASE.origin}${(emoji as any).path}`;

        return <Menu.MenuItem
            key={`downloadify-${isTargeted ? "targeted-" : ""}${sanitizeFilename(emoji.name, {})}-emoji`}
            id={`downloadify-${isTargeted ? "targeted-" : ""}${sanitizeFilename(emoji.name, {})}-emoji`}
            label={`${isSubmenuItem ? "" : "Download "}:${emoji.name}:`}
            submenuItemLabel={`${isTargeted ? "Targeted Emoji " : ""}:${emoji.name}:`}
            icon={() => ImageAsIcon({ src: emojiURL, width: 20, height: 20 })}
            action={async () => await handleDownload({
                alias: `${sanitizeFilename(emoji.name, {})}-emoji`,
                animatable: false,
                urls: { primary: emojiURL },
                mime: isUnicodeEmoji ? "image/svg+xml" : !isAnimated ? "image/png" : "image/gif",
                classifier: isCustomEmoji ? AssetType.CUSTOM_EMOJI : AssetType.UNICODE_EMOJI,
                size: null
            })}
        />;
    }

    function getStickerMenuItem(sticker: any, isTargeted: boolean = false, isSubmenuItem: boolean = false) {
        const stickerData = StickersStore.getStickerById(sticker.id);

        if (!stickerData) {
            return null;
        }

        const guildID = (stickerData as any).guild_id;
        const guild = !guildID ? null : GuildStore.getGuild(guildID);
        const guildNameCleaned = !guild ? "" : sanitizeFilename(guild.name, {});

        // APNG, GIF, & LOTTIE are all considered animated.
        const animated = stickerData.format_type !== StickerFormatType.PNG;
        const isLottie = stickerData.format_type === StickerFormatType.LOTTIE;
        let assetType: AssetType | null = null;
        let stickerSuffix = "";
        let stickerURL = "";
        let mime = "";

        if ([StickerFormatType.APNG, StickerFormatType.PNG].includes(stickerData.format_type)) {
            stickerURL = `${ASSET_MEDIA_PROXY_BASE}/stickers/${sticker.id}.png`;
            assetType = animated ? AssetType.APNG_STICKER : AssetType.PNG_STICKER;
            stickerSuffix = animated ? "apng-sticker" : "png-sticker";
            mime = "image/png";
        } else if (stickerData.format_type === StickerFormatType.GIF) {
            stickerURL = `${ASSET_MEDIA_PROXY_BASE}/stickers/${sticker.id}.gif`;
            assetType = AssetType.GIF_STICKER;
            stickerSuffix = "gif-sticker";
            mime = "image/gif";
        } else if (stickerData.format_type === StickerFormatType.LOTTIE) {
            stickerURL = `${CDN_BASE}/stickers/${sticker.id}.json`;
            assetType = AssetType.LOTTIE_STICKER;
            stickerSuffix = "lottie-sticker";
            mime = "video/lottie+json";
        }

        const stickerNameRaw = stickerData.name;
        const stickerNameDisplay = `:${stickerNameRaw}:`;
        const stickerNameCleaned = sanitizeFilename(stickerNameRaw, {});
        const icon = isLottie ? ImageIcon({ width: 20, height: 20 }) : ImageAsIcon({ src: stickerURL, width: 20, height: 20 });

        return <Menu.MenuItem
            key={`downloadify-${isTargeted ? "targeted-" : ""}${guildNameCleaned ? `${guildNameCleaned}-` : ""}${stickerNameCleaned}-${stickerSuffix}`}
            id={`downloadify-${isTargeted ? "targeted-" : ""}${guildNameCleaned ? `${guildNameCleaned}-` : ""}${stickerNameCleaned}-${stickerSuffix}`}
            label={`${isSubmenuItem ? "" : "Download "}${stickerNameDisplay}`}
            submenuItemLabel={`${isTargeted ? "Targeted Sticker " : ""}${stickerNameDisplay}`}
            icon={() => icon}
            action={async () => await handleDownload({
                alias: `${guildNameCleaned ? `${guildNameCleaned}-` : ""}${stickerNameCleaned ? `${stickerNameCleaned}-` : ""}${stickerSuffix}`,
                animatable: animated,
                urls: { primary: stickerURL },
                mime,
                classifier: assetType,
                size: null
            })}
        />;
    }

    function getEmbedMediaMenuItem(primary: string, mime: string | null | undefined, target: string, isTargeted: boolean = false, index?: number) {
        const key = isTargeted ? "targeted-embed-media" : `embed-media-${index ?? 0}`;

        return <Menu.MenuItem
            key={`downloadify-${key}`}
            id={`downloadify-${key}`}
            label={isTargeted ? `Download ${target}` : target}
            submenuItemLabel={`${isTargeted ? "Targeted " : ""}${target}`}
            icon={() => ["Author Icon", "Footer Icon"].includes(target) ? ImageAsIcon({ src: primary, width: 20, height: 20 }) : ImageIcon({ width: 20, height: 20 })}
            action={async () => await handleDownload({
                alias: `${sanitizeFilename(target.toLowerCase().replace(" ", "-"), {})}`,
                animatable: false,
                urls: { primary },
                mime: mime ?? null,
                classifier: null,
                size: null
            })}
        />;
    }

    function getComponentMediaMenuItem(primary: string, mime: string | null | undefined, target: string, isTargeted: boolean = false, index?: number) {
        const key = isTargeted ? "targeted-component-media" : `component-media-${index ?? 0}`;

        return <Menu.MenuItem
            key={`downloadify-${key}`}
            id={`downloadify-${key}`}
            label={isTargeted ? `Download ${target}` : target}
            submenuItemLabel={`${isTargeted ? "Targeted " : ""}${target}`}
            icon={() => ImageIcon({ width: 20, height: 20 })}
            action={async () => await handleDownload({
                alias: `${sanitizeFilename(target.toLowerCase().replace(" ", "-"), {})}`,
                animatable: false,
                urls: { primary },
                mime: mime ?? null,
                classifier: null,
                size: null
            })}
        />;
    }

    function getAttachmentMenuItem(attachment: { url: string; mime: string | null; size: number; title: string | null; animated: boolean; }, isTargeted: boolean = false, index?: number) {
        const key = isTargeted ? "targeted-attachment" : `attachment-${index ?? 0}`;
        const label = isTargeted ? "Download Attachment" : (attachment.title || `Attachment ${(index ?? 0) + 1}`);

        return <Menu.MenuItem
            key={`downloadify-${key}`}
            id={`downloadify-${key}`}
            label={label}
            submenuItemLabel={`${isTargeted ? "Targeted Attachment" : (attachment.title || `Attachment ${(index ?? 0) + 1}`)}`}
            icon={() => ImageIcon({ width: 20, height: 20 })}
            action={async () => await handleDownload({
                alias: attachment.title ? sanitizeFilename(attachment.title, { splitExtension: true }) : null,
                animatable: attachment.animated,
                urls: { primary: attachment.url },
                mime: attachment.mime,
                classifier: null,
                size: attachment.size
            })}
        />;
    }

    function getEmojiSubmenu(emojis: ExtractedEmojis, keyPrefix: string, includeDownloadPrefix: boolean = false) {
        if (emojis.unicode.length === 0 && emojis.custom.length === 0) {
            return null;
        }

        const onlyHasUnicodeEmojis = emojis.unicode.length > 0 && emojis.custom.length === 0;
        const onlyHasCustomEmojis = emojis.unicode.length === 0 && emojis.custom.length > 0;
        const hasBothEmojiTypes = emojis.unicode.length > 0 && emojis.custom.length > 0;

        const labelPrefix = includeDownloadPrefix ? "Download " : "";
        const label = onlyHasUnicodeEmojis ? `${labelPrefix}Unicode Emojis` : onlyHasCustomEmojis ? `${labelPrefix}Custom Emojis` : `${labelPrefix}Emojis`;

        return <Menu.MenuItem
            key={`downloadify-${keyPrefix}-emojis-submenu`}
            id={`downloadify-${keyPrefix}-emojis-submenu`}
            label={label}
        >
            {onlyHasUnicodeEmojis && emojis.unicode.map(emoji => getEmojiMenuItem(emoji, false, true))}
            {onlyHasCustomEmojis && emojis.custom.map(emoji => getEmojiMenuItem(emoji, false, true))}
            {hasBothEmojiTypes && (
                <>
                    <Menu.MenuItem
                        key={`downloadify-${keyPrefix}-unicode-emojis-submenu`}
                        id={`downloadify-${keyPrefix}-unicode-emojis-submenu`}
                        label="Unicode Emojis"
                    >
                        {emojis.unicode.map(emoji => getEmojiMenuItem(emoji, false, true))}
                    </Menu.MenuItem>
                    <Menu.MenuItem
                        key={`downloadify-${keyPrefix}-custom-emojis-submenu`}
                        id={`downloadify-${keyPrefix}-custom-emojis-submenu`}
                        label="Custom Emojis"
                    >
                        {emojis.custom.map(emoji => getEmojiMenuItem(emoji, false, true))}
                    </Menu.MenuItem>
                </>
            )}
        </Menu.MenuItem>;
    }

    function getInviteMenuItem(invite: InviteData, isTargeted: boolean = false) {
        const sanitizedGuildName = sanitizeFilename(invite.profile.name, {}) || "invite";

        if (isTargeted) {
            const targetKey = targetedInviteBanner ? "banner" : targetedInviteIcon ? "icon" : targetedInviteGame ? "game-icon" : "media";
            const targetedGame = !targetedInviteGame ? null : invite.games.find(game => game.name === targetElement?.getAttribute("alt")) || null;

            if (targetedInviteGame && !targetedGame) {
                return;
            }

            const targetURL = targetedInviteBanner ? `${ASSET_MEDIA_PROXY_BASE.origin}/discovery-splashes/${invite.profile.id}/${invite.banner}.png` :
                targetedInviteIcon && invite.icon ? `${ASSET_MEDIA_PROXY_BASE.origin}/icons/${invite.profile.id}/${invite.icon}.png` :
                    targetedInviteGame && targetedGame ? `${ASSET_MEDIA_PROXY_BASE.origin}/app-icons/${targetedGame.id}/${targetedGame.icon}.png` :
                        null;

            if (!targetURL) {
                return;
            }

            const targetLabel = targetedInviteBanner ? "Invite Banner"
                : targetedInviteIcon ? "Invite Icon"
                    : targetedGame ? `${targetedGame.name} Icon` : "Invite Media";

            const icon = targetedInviteIcon && invite.icon ? ImageAsIcon({ src: targetURL, width: 20, height: 20 }) :
                targetedInviteGame && targetedGame ? ImageAsIcon({ src: targetURL, width: 20, height: 20 }) :
                    ImageIcon({ width: 20, height: 20 });

            const alias = targetedGame ? (sanitizeFilename(targetedGame.name, {}) || "game") + "-icon"
                : targetedInviteIcon ? `${sanitizedGuildName}-icon`
                    : targetedInviteBanner ? `${sanitizedGuildName}-banner`
                        : `${sanitizedGuildName}-media`;

            return <Menu.MenuItem
                key={`downloadify-targeted-invite-${targetKey}`}
                id={`downloadify-targeted-invite-${targetKey}`}
                label={`Download ${targetLabel}`}
                submenuItemLabel={`Targeted ${targetLabel}`}
                icon={() => icon}
                action={async () => await handleDownload({
                    alias: alias,
                    animatable: false,
                    urls: { primary: targetURL },
                    mime: null,
                    classifier: null,
                    size: null
                })}
            />;
        }

        const items: any[] = [];

        if (invite.banner) {
            const bannerURL = `${ASSET_MEDIA_PROXY_BASE.origin}/discovery-splashes/${invite.profile.id}/${invite.banner}.png`;
            items.push(
                <Menu.MenuItem
                    key={`downloadify-${sanitizedGuildName}-banner`}
                    id={`downloadify-${sanitizedGuildName}-banner`}
                    label="Server Banner"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${sanitizedGuildName}-banner`,
                        animatable: false,
                        urls: { primary: bannerURL },
                        mime: null,
                        classifier: null,
                        size: null
                    })}
                />
            );
        }

        if (invite.icon) {
            const iconURL = `${ASSET_MEDIA_PROXY_BASE.origin}/icons/${invite.profile.id}/${invite.icon}.png`;
            items.push(
                <Menu.MenuItem
                    key={`downloadify-${sanitizedGuildName}-icon`}
                    id={`downloadify-${sanitizedGuildName}-icon`}
                    label="Server Icon"
                    icon={() => ImageAsIcon({ src: iconURL, width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${sanitizedGuildName}-icon`,
                        animatable: false,
                        urls: { primary: iconURL },
                        mime: null,
                        classifier: null,
                        size: null
                    })}
                />
            );
        }

        if (invite.games.length > 0) {
            items.push(
                <Menu.MenuItem
                    key={`downloadify-${sanitizedGuildName}-games-submenu`}
                    id={`downloadify-${sanitizedGuildName}-games-submenu`}
                    label="Game Icons"
                >
                    {invite.games.map(game => {
                        const gameIconURL = `${ASSET_MEDIA_PROXY_BASE.origin}/app-icons/${game.id}/${game.icon}.png`;
                        const gameName = sanitizeFilename(game.name, {}) || "game";
                        return (
                            <Menu.MenuItem
                                key={`downloadify-${sanitizedGuildName}-${gameName}-icon`}
                                id={`downloadify-${sanitizedGuildName}-${gameName}-icon`}
                                label={game.name}
                                icon={() => ImageAsIcon({ src: gameIconURL, width: 20, height: 20 })}
                                action={async () => await handleDownload({
                                    alias: `${gameName}-icon`,
                                    animatable: false,
                                    urls: { primary: gameIconURL },
                                    mime: null,
                                    classifier: null,
                                    size: null
                                })}
                            />
                        );
                    })}
                </Menu.MenuItem>
            );
        }

        if (invite.emojis.unicode.length > 0 || invite.emojis.custom.length > 0) {
            const emojiSubmenu = getEmojiSubmenu(invite.emojis, sanitizedGuildName, true);
            emojiSubmenu && items.push(emojiSubmenu);
        }

        return items.length > 0 ? items : null;
    }

    const targetedSeparator = <Menu.MenuSeparator key="downloadify-targeted-separator" />;

    if (targetedEmoji) {
        const targetedEmojiMenu = getEmojiMenuItem(targetedEmoji, true);
        targetedEmojiMenu && downloadifyItems.push(...[targetedEmojiMenu, targetedSeparator]);
    } else if (targetedSticker) {
        const targetedStickerMenu = getStickerMenuItem(targetedSticker, true);
        targetedStickerMenu && downloadifyItems.push(...[targetedStickerMenu, targetedSeparator]);
    } else if (targetedEmbedMedia) {
        const targetedEmbedMediaMenu = getEmbedMediaMenuItem(targetedEmbedMedia.primary!, targetedEmbedMedia.mime!, targetedEmbedMedia.target!, true);
        targetedEmbedMediaMenu && downloadifyItems.push(...[targetedEmbedMediaMenu, targetedSeparator]);
    } else if (targetedComponentMedia) {
        const targetedComponentMediaMenu = getComponentMediaMenuItem(targetedComponentMedia.primary!, targetedComponentMedia.mime!, targetedComponentMedia.target!, true);
        targetedComponentMediaMenu && downloadifyItems.push(...[targetedComponentMediaMenu, targetedSeparator]);
    } else if (targetedAttachment) {
        const targetedAttachmentMenu = getAttachmentMenuItem(targetedAttachment, true);
        targetedAttachmentMenu && downloadifyItems.push(...[targetedAttachmentMenu, targetedSeparator]);
    } else if (targetedInvite) {
        const targetedInviteMenu = getInviteMenuItem(targetedInvite, true);
        targetedInviteMenu && downloadifyItems.push(...[targetedInviteMenu, targetedSeparator]);
    }

    if (!!allEmojis.unicode.length || !!allEmojis.custom.length) {
        const onlyHasUnicodeEmojis = !!allEmojis.unicode.length && !allEmojis.custom.length;
        const onlyHasCustomEmojis = !allEmojis.unicode.length && !!allEmojis.custom.length;
        const hasBothEmojiTypes = !!allEmojis.unicode.length && !!allEmojis.custom.length;

        downloadifyItems.push(
            <Menu.MenuItem
                key="downloadify-emojis-submenu"
                id="downloadify-emojis-submenu"
                label={onlyHasUnicodeEmojis ? "Download Unicode Emojis" : onlyHasCustomEmojis ? "Download Custom Emojis" : "Download Emojis"}
                submenuItemLabel={onlyHasUnicodeEmojis ? "Unicode Emojis" : onlyHasCustomEmojis ? "Custom Emojis" : "Emojis"}
            >
                {onlyHasUnicodeEmojis && allEmojis.unicode.map(emoji => getEmojiMenuItem(emoji, false, true))}
                {onlyHasCustomEmojis && allEmojis.custom.map(emoji => getEmojiMenuItem(emoji, false, true))}
                {hasBothEmojiTypes && (
                    <>
                        <Menu.MenuItem
                            key="downloadify-unicode-emojis-submenu"
                            id="downloadify-unicode-emojis-submenu"
                            label="Unicode Emojis"
                        >
                            {allEmojis.unicode.map(emoji => getEmojiMenuItem(emoji, false, true))}
                        </Menu.MenuItem>
                        <Menu.MenuItem
                            key="downloadify-custom-emojis-submenu"
                            id="downloadify-custom-emojis-submenu"
                            label="Custom Emojis"
                        >
                            {allEmojis.custom.map(emoji => getEmojiMenuItem(emoji, false, true))}
                        </Menu.MenuItem>
                    </>
                )}
            </Menu.MenuItem>
        );
    }

    if (!!message.stickerItems?.length) {
        downloadifyItems.push(
            <Menu.MenuItem
                key="downloadify-stickers-submenu"
                id="downloadify-stickers-submenu"
                label="Download Stickers"
                submenuItemLabel="Stickers"
            >
                {message.stickerItems.map(sticker => getStickerMenuItem(sticker, false, true))}
            </Menu.MenuItem>
        );
    }

    if (!!inviteData.length) {
        const inviteItems = inviteData.flatMap(invite => getInviteMenuItem(invite) || []);

        if (!!inviteItems.length) {
            downloadifyItems.push(
                <Menu.MenuItem
                    key="downloadify-invites-submenu"
                    id="downloadify-invites-submenu"
                    label="Download Invite Media"
                    submenuItemLabel="Invite Media"
                >
                    {inviteItems}
                </Menu.MenuItem>
            );
        }
    }

    if (!!embedData.length) {
        const embedItems: any[] = [];
        const embedEmojis = {
            unicode: [...new Map(embedData.flatMap(data => data.emojis?.unicode ?? []).map(e => [e.emoji, e])).values()],
            custom: [...new Map(embedData.flatMap(data => data.emojis?.custom ?? []).map(e => [e.id, e])).values()]
        };

        const hasMultipleEmbeds = embedData.length > 1;

        embedData.forEach((embed, embedIdx) => {
            const embedSpecificItems: any[] = [];
            let itemIndex = 0;

            if (embed.type === "TENOR" || embed.type === "VIDEO") {
                embed.videos?.forEach(video => {
                    const target = embed.type === "TENOR" ? "Tenor GIF" : "Video";
                    embedSpecificItems.push(getEmbedMediaMenuItem(video.video!, video.videoMime, target, false, itemIndex++));
                });

                if (embed.type === "VIDEO" && (!embed.videos || embed.videos.length === 0) && embed.thumbnail) {
                    embedSpecificItems.push(getEmbedMediaMenuItem(embed.thumbnail!, embed.thumbnailMime, "Thumbnail", false, itemIndex++));
                }
            } else if (embed.type === "IMAGE") {
                const hasMultipleImages = (embed.images?.length ?? 0) > 1;
                embed.images?.forEach((image, imgIdx) => {
                    const label = hasMultipleImages ? `Image ${imgIdx + 1}` : "Image";
                    embedSpecificItems.push(getEmbedMediaMenuItem(image.image!, image.imageMime, label, false, itemIndex++));
                });
            } else if (embed.type === "RICH") {
                const hasMultipleImages = (embed.images?.length ?? 0) > 1;
                embed.images?.forEach((image, imgIdx) => {
                    const label = hasMultipleImages ? `Image ${imgIdx + 1}` : "Image";
                    embedSpecificItems.push(getEmbedMediaMenuItem(image.image!, image.imageMime, label, false, itemIndex++));
                });
                embed.author && embedSpecificItems.push(getEmbedMediaMenuItem(embed.author!, embed.authorMime, "Author Icon", false, itemIndex++));
                embed.footer && embedSpecificItems.push(getEmbedMediaMenuItem(embed.footer!, embed.footerMime, "Footer Icon", false, itemIndex++));
                embed.thumbnail && embedSpecificItems.push(getEmbedMediaMenuItem(embed.thumbnail!, embed.thumbnailMime, "Thumbnail", false, itemIndex++));
                embed.videos?.forEach(video => {
                    embedSpecificItems.push(getEmbedMediaMenuItem(video.video!, video.videoMime, "Video", false, itemIndex++));
                });
            }

            if (embedSpecificItems.length > 0) {
                if (hasMultipleEmbeds) {
                    embedItems.push(
                        <Menu.MenuItem
                            key={`downloadify-embed-${embedIdx}-submenu`}
                            id={`downloadify-embed-${embedIdx}-submenu`}
                            label={`Embed ${embedIdx + 1}`}
                        >
                            {embedSpecificItems}
                        </Menu.MenuItem>
                    );
                } else {
                    embedItems.push(...embedSpecificItems);
                }
            }
        });

        const emojiSubmenu = getEmojiSubmenu(embedEmojis, "embed", false);
        emojiSubmenu && embedItems.unshift(emojiSubmenu);

        if (embedItems.length > 0) {
            downloadifyItems.push(
                <Menu.MenuItem
                    key="downloadify-embeds-submenu"
                    id="downloadify-embeds-submenu"
                    label="Download Embed Media"
                    submenuItemLabel="Embed Media"
                >
                    {embedItems}
                </Menu.MenuItem>
            );
        }
    }

    if (!!componentData.length) {
        const componentItems: any[] = [];
        const componentEmojis = {
            unicode: [...new Map(componentData.flatMap(component => component.emojis.unicode).map(e => [e.emoji, e])).values()],
            custom: [...new Map(componentData.flatMap(component => component.emojis.custom).map(e => [e.id, e])).values()]
        };

        let componentIndex = 0;
        let thumbnailIndex = 0;
        let mediaIndex = 0;

        componentData.forEach(component => {
            component.items.forEach(item => {
                if (item.type === "THUMBNAIL") {
                    thumbnailIndex++;
                    componentItems.push(getComponentMediaMenuItem(item.thumbnail!, item.thumbnailMime, `Component Thumbnail ${thumbnailIndex}`, false, componentIndex++));
                } else if (item.type === "MEDIA") {
                    mediaIndex++;
                    componentItems.push(getComponentMediaMenuItem(item.media!, item.mediaMime, `Component Media ${mediaIndex}`, false, componentIndex++));
                }
            });
        });

        const emojiSubmenu = getEmojiSubmenu(componentEmojis, "component", false);
        emojiSubmenu && componentItems.push(emojiSubmenu);

        if (componentItems.length > 0) {
            downloadifyItems.push(
                <Menu.MenuItem
                    key="downloadify-components-submenu"
                    id="downloadify-components-submenu"
                    label="Download Component Media"
                    submenuItemLabel="Component Media"
                >
                    {componentItems}
                </Menu.MenuItem>
            );
        }
    }

    if (!!attachmentData.length) {
        downloadifyItems.push(
            <Menu.MenuItem
                key="downloadify-attachments-submenu"
                id="downloadify-attachments-submenu"
                label="Download Attachments"
                submenuItemLabel="Attachments"
            >
                {attachmentData.map((attachment, index) => getAttachmentMenuItem(attachment, false, index))}
            </Menu.MenuItem>
        );
    }

    if (!downloadifyItems.length) {
        return;
    }

    joinOrCreateContextMenuGroup(
        children,
        downloadifyItems,
        "message-content-group",
        "downloadify-submenu",
        "Download",
        [{
            id: { child: "devmode-copy-id" },
            type: "WITH_GROUP",
            position: "START"
        }]
    );
}

export function QuestTileContextMenu(children: Array<any>, props: QuestTileContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [QUEST TILE CONTEXT MENU OPENED]\n`, props);

    if (!props?.quest) {
        return;
    }

    const { quest } = props;
    const { config } = quest;
    const { messages, assets, rewardsConfig, videoMetadata } = config;
    const questNameSanitized = sanitizeFilename(messages.questName, {});
    const questNameCleaned = questNameSanitized ? `${questNameSanitized}-quest` : "quest";

    const downloadifyItems: any[] = [];

    if (rewardsConfig?.rewards?.length) {
        for (const [index, reward] of rewardsConfig.rewards.entries()) {
            if (!reward.skuId) {
                continue;
            }

            const collectible = CollectiblesData.getch(reward.skuId);

            if (!collectible) {
                continue;
            }

            const typeText = collectible.type === CollectibleType.AVATAR_DECORATION
                ? "Decoration"
                : collectible.type === CollectibleType.NAMEPLATE
                    ? "Nameplate"
                    : collectible.type === CollectibleType.PROFILE_EFFECT
                        ? "Effect"
                        : null;

            if (!typeText) {
                continue;
            }

            const nonEffectClassifier = collectible.type === CollectibleType.AVATAR_DECORATION
                ? AssetType.AVATAR_DECORATION
                : collectible.type === CollectibleType.NAMEPLATE
                    ? AssetType.NAMEPLATE
                    : null;

            const decorationURL = collectible.type === CollectibleType.AVATAR_DECORATION
                ? `${ASSET_MEDIA_PROXY_BASE.origin}/avatar-decoration-presets/${collectible.asset}.png`
                : null;

            const nameplateURL = collectible.type === CollectibleType.NAMEPLATE
                ? `${CDN_BASE.origin}/assets/collectibles/${collectible.asset}static.png`
                : null;

            const nonEffectURL = decorationURL || nameplateURL;
            const rewardNameSanitized = sanitizeFilename(collectible.name, {});
            const rewardNameCleaned = (rewardNameSanitized ? (rewardNameSanitized + `-${typeText.toLocaleLowerCase()}`) : typeText.toLowerCase()) + `-reward-${index}`;

            const icon = !decorationURL
                ? () => ImageIcon({ width: 20, height: 20 })
                : () => ImageAsIcon({ src: decorationURL, width: 20, height: 20 });

            downloadifyItems.push(
                collectible.type === CollectibleType.PROFILE_EFFECT
                    ? (
                        <Menu.MenuItem
                            id={`downloadify-${rewardNameCleaned}-quest-reward`}
                            label={`${collectible.name} ${typeText}`}
                        >
                            <Menu.MenuItem
                                id="downloadify-quest-reward-profile-effect-thumbnail"
                                label="Thumbnail"
                                icon={icon}
                                action={async () => await handleDownload(
                                    {
                                        alias: `${rewardNameCleaned ? `${rewardNameCleaned}-` : ""}thumbnail`,
                                        animatable: false,
                                        urls: { primary: collectible.thumbnailPreviewSrc },
                                        mime: "image/png",
                                        classifier: AssetType.PROFILE_EFFECT_THUMBNAIL,
                                        size: null,
                                    }
                                )}
                            />
                            <Menu.MenuItem
                                id="downloadify-quest-reward-profile-effect-primary"
                                label="Primary"
                                icon={icon}
                                action={async () => await handleDownload(
                                    {
                                        alias: `${rewardNameCleaned ? `${rewardNameCleaned}-` : ""}primary`,
                                        animatable: true,
                                        urls: { primary: collectible.effects[0].src },
                                        mime: "image/png",
                                        classifier: AssetType.PROFILE_EFFECT_PRIMARY,
                                        size: null,
                                    }
                                )}
                            />
                            <Menu.MenuItem
                                id="downloadify-quest-reward-profile-effect-secondary"
                                label="Secondary"
                                icon={icon}
                                action={async () => await handleDownload(
                                    {
                                        alias: `${rewardNameCleaned ? `${rewardNameCleaned}-` : ""}secondary`,
                                        animatable: true,
                                        urls: { primary: collectible.effects[1].src },
                                        mime: "image/png",
                                        classifier: AssetType.PROFILE_EFFECT_SECONDARY,
                                        size: null,
                                    }
                                )}
                            />
                        </Menu.MenuItem>
                    )
                    : (
                        <Menu.MenuItem
                            id={`downloadify-${rewardNameCleaned}-quest-reward`}
                            label={`${collectible.name} ${typeText}`}
                            icon={icon}
                            action={async () => await handleDownload({
                                alias: rewardNameCleaned,
                                animatable: true,
                                urls: { primary: nonEffectURL! },
                                mime: null,
                                classifier: nonEffectClassifier,
                                size: null
                            })}
                        />
                    )
            );
        }
    }

    const gameTileDarkLightSame = assets.gameTileDark && assets.gameTileLight && assets.gameTileDark === assets.gameTileLight;
    const logotypeDarkLightSame = assets.logotypeDark && assets.logotypeLight && assets.logotypeDark === assets.logotypeLight;
    const heroQuestBarSame = assets.hero && assets.questBarHero && assets.hero === assets.questBarHero;
    const heroVideoQuestBarVideoSame = assets.heroVideo && assets.questBarHeroVideo && assets.heroVideo === assets.questBarHeroVideo;

    const questAssetItems = [
        logotypeDarkLightSame ? (
            <Menu.MenuItem
                id="downloadify-quest-text-logo"
                label="Text Logo"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}text-logo`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.logotypeDark}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        !logotypeDarkLightSame && assets.logotypeDark ? (
            <Menu.MenuItem
                id="downloadify-quest-text-logo-dark"
                label="Text Logo (Dark)"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}text-logo-dark`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.logotypeDark}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        !logotypeDarkLightSame && assets.logotypeLight ? (
            <Menu.MenuItem
                id="downloadify-quest-text-logo-light"
                label="Text Logo (Light)"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}text-logo-light`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.logotypeLight}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        gameTileDarkLightSame ? (
            <Menu.MenuItem
                id="downloadify-quest-image-logo"
                label="Image Logo"
                icon={() => ImageAsIcon({ src: `${CDN_BASE.origin}/${assets.gameTileDark}`, width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}image-logo`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.gameTileDark}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        !gameTileDarkLightSame && assets.gameTileDark ? (
            <Menu.MenuItem
                id="downloadify-quest-image-logo-dark"
                label="Image Logo (Dark)"
                icon={() => ImageAsIcon({ src: `${CDN_BASE.origin}/${assets.gameTileDark}`, width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}image-logo-dark`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.gameTileDark}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        !gameTileDarkLightSame && assets.gameTileLight ? (
            <Menu.MenuItem
                id="downloadify-quest-image-logo-light"
                label="Image Logo (Light)"
                icon={() => ImageAsIcon({ src: `${CDN_BASE.origin}/${assets.gameTileLight}`, width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}image-logo-light`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.gameTileLight}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        assets.hero ? (
            <Menu.MenuItem
                id="downloadify-quest-hero"
                label="Tile Banner Image"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}hero`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.hero}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        assets.heroVideo ? (
            <Menu.MenuItem
                id="downloadify-quest-hero-video"
                label="Tile Banner Video"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}hero-video`,
                        animatable: true,
                        urls: { primary: `${CDN_BASE.origin}/${assets.heroVideo}` },
                        mime: null,
                        classifier: null,
                        size: null,
                    }
                )}
            />
        ) : null,
        !heroQuestBarSame && assets.questBarHero ? (
            <Menu.MenuItem
                id="downloadify-quest-bar-hero"
                label="Quest Bar Image"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}quest-bar-hero`,
                        animatable: false,
                        urls: { primary: `${CDN_BASE.origin}/${assets.questBarHero}` },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        !heroVideoQuestBarVideoSame && assets.questBarHeroVideo ? (
            <Menu.MenuItem
                id="downloadify-quest-bar-hero-video"
                label="Quest Bar Video"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}quest-bar-hero-video`,
                        animatable: true,
                        urls: { primary: `${CDN_BASE.origin}/${assets.questBarHeroVideo}` },
                        mime: null,
                        classifier: null,
                        size: null,
                    }
                )}
            />
        ) : null,
        videoMetadata?.assets ? (
            <Menu.MenuItem
                id="downloadify-quest-video"
                label="Video"
            >
                {[
                    videoMetadata.assets.videoPlayerCaption ? (
                        <Menu.MenuItem
                            id="downloadify-quest-video-caption"
                            label="Captions"
                            icon={() => ImageIcon({ width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}video-captions`,
                                    animatable: false,
                                    urls: { primary: `${CDN_BASE.origin}/${videoMetadata.assets.videoPlayerCaption}` },
                                    mime: null,
                                    classifier: null,
                                    size: null,
                                }
                            )}
                        />
                    ) : null,
                    videoMetadata.assets.videoPlayerThumbnail ? (
                        <Menu.MenuItem
                            id="downloadify-quest-video-thumbnail"
                            label="Thumbnail"
                            icon={() => ImageIcon({ width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}video-thumbnail`,
                                    animatable: false,
                                    urls: { primary: `${CDN_BASE.origin}/${videoMetadata.assets.videoPlayerThumbnail}` },
                                    mime: null,
                                    classifier: AssetType.GENERIC_STATIC,
                                    size: null,
                                }
                            )}
                        />
                    ) : null,
                    videoMetadata.assets.videoPlayerTranscript ? (
                        <Menu.MenuItem
                            id="downloadify-quest-video-transcript"
                            label="Transcript"
                            icon={() => ImageIcon({ width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}video-transcript`,
                                    animatable: false,
                                    urls: { primary: `${CDN_BASE.origin}/${videoMetadata.assets.videoPlayerTranscript}` },
                                    mime: null,
                                    classifier: null,
                                    size: null,
                                }
                            )}
                        />
                    ) : null,
                    videoMetadata.assets.videoPlayerVideoHls ? (
                        <Menu.MenuItem
                            id="downloadify-quest-video-m3u8"
                            label="M3U8"
                            icon={() => ImageIcon({ width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}video-m3u8`,
                                    animatable: false,
                                    urls: { primary: `${CDN_BASE.origin}/${videoMetadata.assets.videoPlayerVideoHls}` },
                                    mime: null,
                                    classifier: null,
                                    size: null,
                                }
                            )}
                        />
                    ) : null,
                    videoMetadata.assets.videoPlayerVideo ? (
                        <Menu.MenuItem
                            id="downloadify-quest-video-hd"
                            label="HD"
                            icon={() => ImageIcon({ width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}video-hd`,
                                    animatable: false,
                                    urls: { primary: `${CDN_BASE.origin}/${videoMetadata.assets.videoPlayerVideo}` },
                                    mime: null,
                                    classifier: null,
                                    size: null,
                                }
                            )}
                        />
                    ) : null,
                    videoMetadata.assets.videoPlayerVideoLowRes ? (
                        <Menu.MenuItem
                            id="downloadify-quest-video-sd"
                            label="SD"
                            icon={() => ImageIcon({ width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${questNameCleaned ? `${questNameCleaned}-` : ""}video-sd`,
                                    animatable: false,
                                    urls: { primary: `${CDN_BASE.origin}/${videoMetadata.assets.videoPlayerVideoLowRes}` },
                                    mime: null,
                                    classifier: null,
                                    size: null,
                                }
                            )}
                        />
                    ) : null
                ].filter(Boolean)}
            </Menu.MenuItem>
        ) : null
    ].filter(Boolean);

    downloadifyItems.push(...questAssetItems);

    if (!downloadifyItems.length) {
        return;
    }

    joinOrCreateContextMenuGroup(
        children,
        downloadifyItems,
        "quest-content-group",
        "downloadify-submenu",
        "Download",
        [{
            id: { child: "play-game" },
            type: "WITH_GROUP",
            position: "START"
        }],
        true
    );
}

export function ShopCategoryHeaderContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: ShopCategoryHeaderContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [SHOP CATEGORY HEADER CONTEXT MENU OPENED]\n`, props, event);

    if (!props) {
        return;
    }

    const { name, catalogBannerAsset, heroBannerAsset, heroLogoUrl, featuredBlockUrl, mobileBannerUrl, mobileBgUrl, pdpBgUrl } = props;
    const nameSanitized = sanitizeFilename(name, {});
    const nameCleaned = nameSanitized ? `${nameSanitized}-shop-category-header` : "shop-category-header";

    const downloadifyItems = [
        heroLogoUrl ? (
            <Menu.MenuItem
                id="downloadify-shop-category-logo"
                label={`${name} Logo`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}logo`,
                        animatable: false,
                        urls: { primary: heroLogoUrl },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        featuredBlockUrl ? (
            <Menu.MenuItem
                id="downloadify-shop-category-featured-banner-preview"
                label={`${name} Preview Banner`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}preview`,
                        animatable: false,
                        urls: { primary: featuredBlockUrl! },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        heroBannerAsset?.static ? (
            <Menu.MenuItem
                id="downloadify-shop-category-featured-banner-static"
                label={`${name} Featured Static Banner`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}featured-static`,
                        animatable: false,
                        urls: { primary: heroBannerAsset.static! },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        heroBannerAsset?.animated ? (
            <Menu.MenuItem
                id="downloadify-shop-category-featured-banner-animated"
                label={`${name} Featured Animated Banner`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}featured-animated`,
                        animatable: true,
                        urls: { primary: heroBannerAsset.animated! },
                        mime: null,
                        classifier: null,
                        size: null,
                    }
                )}
            />
        ) : null,
        catalogBannerAsset?.static ? (
            <Menu.MenuItem
                id="downloadify-shop-category-listing-banner-static"
                label={`${name} Listing Static Banner`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}listing-static`,
                        animatable: false,
                        urls: { primary: catalogBannerAsset.static! },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        catalogBannerAsset?.animated ? (
            <Menu.MenuItem
                id="downloadify-shop-category-listing-banner-animated"
                label={`${name} Listing Animated Banner`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}listing-animated`,
                        animatable: true,
                        urls: { primary: catalogBannerAsset.animated! },
                        mime: null,
                        classifier: null,
                        size: null,
                    }
                )}
            />
        ) : null,
        mobileBannerUrl ? (
            <Menu.MenuItem
                id="downloadify-shop-category-mobile-banner-static"
                label={`${name} Mobile Banner`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}mobile-static`,
                        animatable: false,
                        urls: { primary: mobileBannerUrl },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        mobileBgUrl ? (
            <Menu.MenuItem
                id="downloadify-shop-category-mobile-bg-static"
                label={`${name} Mobile Background`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}mobile-bg-static`,
                        animatable: false,
                        urls: { primary: mobileBgUrl },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null,
        pdpBgUrl ? (
            <Menu.MenuItem
                id="downloadify-shop-category-product-page-bg-static"
                label={`${name} Product Page Background`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload(
                    {
                        alias: `${nameCleaned ? `${nameCleaned}-` : ""}product-page-bg-static`,
                        animatable: false,
                        urls: { primary: pdpBgUrl },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null,
                    }
                )}
            />
        ) : null
    ].filter(Boolean);

    if (!downloadifyItems.length) {
        return;
    }

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-shop-category-header"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Shop Header"
        >
            <Menu.MenuItem
                id="downloadify-shop-category-header-items"
                label="Download"
            >
                {downloadifyItems}
            </Menu.MenuItem>
        </Menu.Menu>;
    });
}

export async function ShopListingContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: ShopListingContextMenuProps, card: HTMLElement): Promise<void> {
    DownloadifyLogger.info(`[${getFormattedNow()}] [SHOP LISTING CONTEXT MENU OPENED]\n`, props, card, event);

    if (!props) {
        return;
    }

    const target = props.type === CollectibleType.VARIANTS_GROUP ? props.variants! : props.items;
    const downloadifyItems: any[] = [];

    for (const [index, item] of target.entries()) {
        const collectible = await CollectiblesData.fetch(item.skuId);

        if (!collectible) {
            return;
        }

        const typeText = collectible.type === CollectibleType.AVATAR_DECORATION
            ? "Decoration"
            : collectible.type === CollectibleType.NAMEPLATE
                ? "Nameplate"
                : collectible.type === CollectibleType.PROFILE_EFFECT
                    ? "Effect"
                    : "Unknown";

        const nonEffectClassifier = collectible.type === CollectibleType.AVATAR_DECORATION
            ? AssetType.AVATAR_DECORATION
            : collectible.type === CollectibleType.NAMEPLATE
                ? AssetType.NAMEPLATE
                : null;

        const decorationURL = collectible.type === CollectibleType.AVATAR_DECORATION
            ? `${ASSET_MEDIA_PROXY_BASE.origin}/avatar-decoration-presets/${collectible.asset}.png`
            : null;

        const nameplateURL = collectible.type === CollectibleType.NAMEPLATE
            ? `${CDN_BASE.origin}/assets/collectibles/${collectible.asset}static.png`
            : null;

        const nonEffectURL = decorationURL || nameplateURL;
        const nameSanitized = sanitizeFilename(collectible.name, {});
        const nameCleaned = (nameSanitized ? (nameSanitized + `-${typeText.toLocaleLowerCase()}`) : typeText.toLowerCase()) + `-${index}`;

        const icon = !decorationURL
            ? () => ImageIcon({ width: 20, height: 20 })
            : () => ImageAsIcon({ src: decorationURL, width: 20, height: 20 });

        downloadifyItems.push(
            collectible.type === CollectibleType.PROFILE_EFFECT
                ? (
                    <Menu.MenuItem
                        id={`downloadify-${nameCleaned}-shop-listing`}
                        label={`${collectible.name} ${typeText}`}
                    >
                        <Menu.MenuItem
                            id="downloadify-user-profile-effect-thumbnail"
                            label="Thumbnail"
                            icon={icon}
                            action={async () => await handleDownload(
                                {
                                    alias: `${nameCleaned ? `${nameCleaned}-` : ""}thumbnail`,
                                    animatable: false,
                                    urls: { primary: collectible.thumbnailPreviewSrc },
                                    mime: "image/png",
                                    classifier: AssetType.PROFILE_EFFECT_THUMBNAIL,
                                    size: null,
                                }
                            )}
                        />
                        <Menu.MenuItem
                            id="downloadify-user-profile-effect-primary"
                            label="Primary"
                            icon={icon}
                            action={async () => await handleDownload(
                                {
                                    alias: `${nameCleaned ? `${nameCleaned}-` : ""}primary`,
                                    animatable: true,
                                    urls: { primary: collectible.effects[0].src },
                                    mime: "image/png",
                                    classifier: AssetType.PROFILE_EFFECT_PRIMARY,
                                    size: null,
                                }
                            )}
                        />
                        <Menu.MenuItem
                            id="downloadify-user-profile-effect-secondary"
                            label="Secondary"
                            icon={icon}
                            action={async () => await handleDownload(
                                {
                                    alias: `${nameCleaned ? `${nameCleaned}-` : ""}secondary`,
                                    animatable: true,
                                    urls: { primary: collectible.effects[1].src },
                                    mime: "image/png",
                                    classifier: AssetType.PROFILE_EFFECT_SECONDARY,
                                    size: null,
                                }
                            )}
                        />
                    </Menu.MenuItem>
                )
                : (
                    <Menu.MenuItem
                        id={`downloadify-${nameCleaned}-shop-listing`}
                        label={`${collectible.name} ${typeText}`}
                        icon={icon}
                        action={async () => await handleDownload({
                            alias: nameCleaned,
                            animatable: true,
                            urls: { primary: nonEffectURL! },
                            mime: null,
                            classifier: nonEffectClassifier,
                            size: null
                        })}
                    />
                )
        );
    }

    if (!downloadifyItems.length && card) {
        const videoURL = card?.querySelector("source")?.src;
        const imgURL = card?.querySelector("img")?.src;

        const nameSanitized = sanitizeFilename(props.name, {});
        const videoNameCleaned = (nameSanitized ? (nameSanitized + "-video") : "video");
        const imgNameCleaned = (nameSanitized ? (nameSanitized + "-image") : "image");

        if (videoURL) {
            downloadifyItems.push(
                <Menu.MenuItem
                    id={`downloadify-${videoNameCleaned}-video-shop-listing`}
                    label={`${props.name} Video`}
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: videoNameCleaned,
                        animatable: false,
                        urls: { primary: videoURL },
                        mime: null,
                        classifier: null,
                        size: null
                    })}
                />
            );
        }

        if (imgURL) {
            downloadifyItems.push(
                <Menu.MenuItem
                    id={`downloadify-${imgNameCleaned}-image-shop-listing`}
                    label={`${props.name} Image`}
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: imgNameCleaned,
                        animatable: false,
                        urls: { primary: imgURL },
                        mime: null,
                        classifier: AssetType.GENERIC_STATIC,
                        size: null
                    })}
                />
            );
        }
    }

    if (!downloadifyItems.length) {
        return;
    }

    // Prevents `Cannot read properties of null (reading 'contains')`
    // which occurs only with this context menu for some reason.
    event.currentTarget ??= event.target as any;

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-shop-listing"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Shop Listing"
        >
            <Menu.MenuItem
                id="downloadify-shop-listing-items"
                label="Download"
            >
                {downloadifyItems}
            </Menu.MenuItem>
        </Menu.Menu>;
    });
}

export function OrbsPopoutShopImageContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: OrbsPopoutShopImageContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [ORBS SHOP POPOUT IMAGE CONTEXT MENU OPENED]\n`, props, event);

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-orbs-shop-image"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Orbs Shop Icon"
        >
            <Menu.MenuItem
                id="downloadify-orbs-shop-image-static"
                label="Download Static Orbs Image"
                icon={() => ImageAsIcon({ src: props.static, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: "orbs-shop-image-static",
                    animatable: false,
                    urls: { primary: props.static },
                    mime: "image/png",
                    classifier: "image/png",
                    size: null
                })}
            />
            <Menu.MenuItem
                id="downloadify-orbs-shop-image-animated"
                label="Download Animated Orbs Image"
                icon={() => ImageAsIcon({ src: props.static, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: "orbs-shop-image-animated",
                    animatable: false,
                    urls: { primary: props.animated },
                    mime: "video/webm",
                    classifier: "video/webm",
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

export function QuestRewardContextMenu(event: React.MouseEvent<HTMLButtonElement>, asset: string | null): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [QUEST REWARD CONTEXT MENU OPENED]\n`, asset, event);

    if (!asset) {
        return;
    }

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-quest-reward-preview"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Quest Reward Preview"
        >
            <Menu.MenuItem
                id="downloadify-quest-reward-preview"
                label="Download Quest Reward Preview"
                icon={() => ImageAsIcon({
                    src: asset + "?format=png&size=128",
                    width: 20,
                    height: 20
                })}
                action={async () => await handleDownload({
                    alias: "quest-reward-preview",
                    animatable: true,
                    urls: { primary: asset },
                    mime: null,
                    classifier: null,
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

export function ChannelContextMenu(children: Array<any>, props: ChannelContextMenuProps): void {
    if (!children?.length || !props?.channel?.id) {
        return;
    }

    DownloadifyLogger.info(`[${getFormattedNow()}] [CHANNEL CONTEXT MENU OPENED]\n`, props);

    const { channel } = props;
    const manualEmojis = extractEmojis(channel.name + (channel.topic ?? ""));
    const builtinEmoji = extractEmojis(JSON.stringify((channel as any).iconEmoji ?? ""));
    const builtinEmojiName = builtinEmoji.custom[0]
        ? builtinEmoji.custom[0]?.name
        : builtinEmoji.unicode[0]?.name;
    const builtinIsUnicode = !!!builtinEmoji.custom[0]?.id;
    const builtinEmojiNameFormatted = !builtinEmojiName ? null : `:${builtinEmojiName}:`;
    const builtinEmojiAnimatable = !!builtinEmoji.custom[0]?.id ? !!builtinEmoji.custom[0]?.animated : false;
    const builtinEmojiURL = !!builtinEmoji.custom[0]?.id
        ? `${ASSET_MEDIA_PROXY_BASE.origin}/emojis/${builtinEmoji.custom[0].id}.${builtinEmojiAnimatable ? "gif" : "png"}`
        : !!builtinEmoji.unicode[0]?.path
            ? `${PRIMARY_DOMAIN_BASE.origin}${builtinEmoji.unicode[0].path}`
            : null;

    if (!manualEmojis.unicode.length && !builtinEmojiURL) {
        return;
    }

    const downloadifyItems = [
        !!manualEmojis.unicode.length ? (
            <Menu.MenuItem
                id="downloadify-manual-channel-emoji"
                label="Manual Channel Emojis"
            >
                {[...manualEmojis.unicode.map(emoji => {
                    return <Menu.MenuItem
                        key={`downloadify-${sanitizeFilename(emoji.name, {})}-manual-emoji`}
                        id={`downloadify-${sanitizeFilename(emoji.name, {})}-manual-emoji`}
                        label={`:${emoji.name}:`}
                        icon={() => ImageAsIcon({ src: PRIMARY_DOMAIN_BASE.origin + emoji.path, width: 20, height: 20 })}
                        action={async () => await handleDownload({
                            alias: `${channel.name ? `${channel.name}-` : ""}${sanitizeFilename(emoji.name, {})}-manual-emoji`,
                            animatable: false,
                            urls: { primary: PRIMARY_DOMAIN_BASE.origin + emoji.path },
                            mime: "image/svg",
                            classifier: AssetType.UNICODE_EMOJI,
                            size: null
                        })}
                    />;
                })]}
            </Menu.MenuItem>
        ) : null,
        builtinEmojiURL ? (
            <Menu.MenuItem
                id="downloadify-builtin-channel-emoji"
                label="Designated Emoji Icon"
            >
                <Menu.MenuItem
                    id="downloadify-builtin-channel-emoji-icon"
                    label={builtinEmojiNameFormatted || "Emoji"}
                    icon={() => ImageAsIcon({ src: builtinEmojiURL, width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${channel.name ? `${channel.name}-` : ""}builtin-emoji-icon`,
                        animatable: builtinEmojiAnimatable,
                        urls: { primary: builtinEmojiURL },
                        mime: null,
                        classifier: builtinIsUnicode ? AssetType.UNICODE_EMOJI : AssetType.CUSTOM_EMOJI,
                        size: null
                    })}
                />
            </Menu.MenuItem>
        ) : null
    ].filter(Boolean);

    joinOrCreateContextMenuGroup(
        children,
        downloadifyItems,
        "channel-content-group",
        "downloadify-submenu",
        "Download",
        [{
            id: { child: "devmode-copy-id" },
            type: "WITH_GROUP",
            position: "START"
        }],
        true
    );
}

export function GDMContextMenu(children: Array<any>, props: GDMContextMenuProps): void {
    if (!children?.length || !props?.channel?.id) {
        return;
    }

    DownloadifyLogger.info(`[${getFormattedNow()}] [GROUP DM CONTEXT MENU OPENED]\n`, props);

    const { channel } = props;
    const channelIconHash = channel.icon || null;
    const channelIconURL = channelIconHash ? `${ASSET_MEDIA_PROXY_BASE}/channel-icons/${channel.id}/${channelIconHash}.png` : null;
    const channelTimestamp = Number(BigInt(channel.id) >> 22n);
    const defaultChannelIconURL = channelTimestamp ? `${PRIMARY_DOMAIN_BASE}${defaultAssets.DEFAULT_GROUP_DM_AVATARS[channelTimestamp % 8]}` : null;

    if (!channelIconURL && !defaultChannelIconURL) {
        return;
    }

    const downloadifyItems = [
        channelIconURL ? (
            <Menu.MenuItem
                id="downloadify-gdm-channel-icon"
                label="Download Group Icon"
                submenuItemLabel="Group Icon"
                icon={() => ImageAsIcon({ src: channelIconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: channel.name ? `${channel.name}-group-icon` : "",
                    animatable: false,
                    urls: { primary: channelIconURL },
                    mime: "image/png",
                    classifier: AssetType.GUILD_ICON,
                    size: null
                })}
            />
        ) : null,
        defaultChannelIconURL ? (
            <Menu.MenuItem
                id="downloadify-default-gdm-channel-icon"
                label="Download Default Icon"
                submenuItemLabel="Default Icon"
                icon={() => ImageAsIcon({ src: defaultChannelIconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: channel.name ? `${channel.name}-default-group-icon` : "",
                    animatable: false,
                    urls: { primary: defaultChannelIconURL },
                    mime: "image/png",
                    classifier: AssetType.DEFAULT_GROUP_ICON,
                    size: null
                })}
            />
        ) : null
    ].filter(Boolean);

    joinOrCreateContextMenuGroup(
        children,
        downloadifyItems,
        "group-channel-content-group",
        "downloadify-submenu",
        "Download",
        [{
            id: { child: "devmode-copy-id" },
            type: "WITH_GROUP",
            position: "START"
        }]
    );
}

export function GuildContextMenu(children: Array<any>, props: GuildContextMenuProps): void {
    if (!children?.length || !props?.guild?.id) {
        return;
    }

    DownloadifyLogger.info(`[${getFormattedNow()}] [GUILD CONTEXT MENU OPENED]\n`, props);

    const { guild } = props;
    const guildIconHash = guild.icon || null;
    const guildBannerHash = guild.banner || null;
    const guildInviteHash = guild.splash !== guildBannerHash ? guild.splash || null : null;
    const guildDiscoveryHash = guild.discoverySplash !== guildInviteHash && guild.discoverySplash !== guildBannerHash ? guild.discoverySplash || null : null;
    const guildIconHashAnimated = !!guildIconHash?.startsWith("a_");
    const guildBannerHashAnimated = !!guildBannerHash?.startsWith("a_");
    const guildIconURL = guildIconHash ? `${ASSET_MEDIA_PROXY_BASE}/icons/${guild.id}/${guildIconHash}.${guildIconHashAnimated ? "gif" : "png"}` : null;
    const guildBannerURL = guildBannerHash ? `${ASSET_MEDIA_PROXY_BASE}/banners/${guild.id}/${guildBannerHash}.${guildBannerHashAnimated ? "gif" : "png"}` : null;
    const guildInviteURL = guildInviteHash ? `${ASSET_MEDIA_PROXY_BASE}/splashes/${guild.id}/${guildInviteHash}.png` : null;
    const guildDiscoveryURL = guildDiscoveryHash ? `${ASSET_MEDIA_PROXY_BASE}/discovery-splashes/${guild.id}/${guildDiscoveryHash}.png` : null;

    if (!guildIconURL && !guildBannerURL && !guildInviteURL && !guildDiscoveryURL) {
        return;
    }

    const downloadifyItems = [
        guildIconURL ? (
            <Menu.MenuItem
                id="downloadify-guild-icon"
                label="Download Icon"
                submenuItemLabel="Icon"
                icon={() => ImageAsIcon({ src: guildIconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: guild.name ? `${guild.name}-icon` : "",
                    animatable: guildIconHashAnimated,
                    urls: { primary: guildIconURL },
                    mime: guildIconHashAnimated ? "image/gif" : "image/png",
                    classifier: AssetType.GUILD_ICON,
                    size: null
                })}
            />
        ) : null,
        guildBannerURL ? (
            <Menu.MenuItem
                id="downloadify-guild-banner"
                label="Download Banner"
                submenuItemLabel="Banner"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: guild.name ? `${guild.name}-banner` : "",
                    animatable: guildBannerHashAnimated,
                    urls: { primary: guildBannerURL },
                    mime: guildBannerHashAnimated ? "image/gif" : "image/png",
                    classifier: AssetType.GUILD_BANNER,
                    size: null
                })}
            />
        ) : null,
        guildInviteURL ? (
            <Menu.MenuItem
                id="downloadify-guild-invite-splash"
                label="Download Invite Splash"
                submenuItemLabel="Invite Splash"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: guild.name ? `${guild.name}-invite-splash` : "",
                    animatable: false,
                    urls: { primary: guildInviteURL },
                    mime: "image/png",
                    classifier: AssetType.GUILD_INVITE_SPLASH,
                    size: null
                })}
            />
        ) : null,
        guildDiscoveryURL ? (
            <Menu.MenuItem
                id="downloadify-guild-discovery-splash"
                label="Download Discovery Splash"
                submenuItemLabel="Discovery Splash"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: guild.name ? `${guild.name}-discovery-splash` : "",
                    animatable: false,
                    urls: { primary: guildDiscoveryURL },
                    mime: "image/png",
                    classifier: AssetType.GUILD_DISCOVERY_SPLASH,
                    size: null
                })}
            />
        ) : null
    ].filter(Boolean);

    joinOrCreateContextMenuGroup(
        children,
        downloadifyItems,
        "guild-content-group",
        "downloadify-submenu",
        "Download",
        [{
            id: { child: "devmode-copy-id" },
            type: "WITH_GROUP",
            position: "START"
        },
        {
            id: { child: "privacy" },
            type: "WITH_GROUP",
            position: "END"
        }]
    );
}

export function ExpressionPickerContextMenu(children: Array<any>, props: { target: HTMLElement; }): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [EXPRESSION PICKER CONTEXT MENU OPENED]\n`, props);

    const { target } = props;
    const isType = target.getAttribute("data-type");
    const isEmoji = isType === "emoji";
    const isSticker = isType === "sticker";
    const items: any[] = [];

    if (isEmoji) {
        const animated = !!target.getAttribute("data-animated");
        const unicodeEmoji = target.getAttribute("data-surrogates");
        const unicodeEmojiPath = unicodeEmoji ? getUnicodeEmojiPath(unicodeEmoji) : null;
        const emojiCustomID = target.getAttribute("data-id");
        const isUnicodeEmoji = !!unicodeEmoji;
        const isCustomEmoji = !!emojiCustomID;
        const emojiNameRaw = target.getAttribute("data-name");
        const emojiNameDisplay = !emojiNameRaw ? null : `:${emojiNameRaw}:`;
        const emojiNameCleaned = !emojiNameRaw ? null : sanitizeFilename(emojiNameRaw, {});

        const emojiURL = isCustomEmoji && emojiCustomID
            ? `${ASSET_MEDIA_PROXY_BASE.origin}/emojis/${emojiCustomID}.${animated ? "gif" : "png"}`
            : isUnicodeEmoji && unicodeEmojiPath
                ? `${PRIMARY_DOMAIN_BASE.origin}${unicodeEmojiPath}`
                : null;

        if (!emojiURL) {
            return;
        }

        const emojiSuffix = isUnicodeEmoji ? "unicode-emoji" : "custom-emoji";

        items.push(
            <Menu.MenuItem
                id="downloadify-emoji"
                label={`Download ${emojiNameDisplay}`}
                icon={() => ImageAsIcon({ src: emojiURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${emojiNameCleaned ? `${emojiNameCleaned}-` : ""}${emojiSuffix}`,
                    animatable: animated,
                    urls: { primary: emojiURL },
                    mime: isUnicodeEmoji ? "image/svg+xml" : !animated ? "image/png" : "image/gif",
                    classifier: isUnicodeEmoji ? AssetType.UNICODE_EMOJI : AssetType.CUSTOM_EMOJI,
                    size: null
                })}
            />
        );
    } else if (isSticker) {
        const stickerID = target.getAttribute("data-id");
        const stickerData = !stickerID ? null : StickersStore.getStickerById(stickerID);

        if (!stickerData) {
            return;
        }

        const guildID = (stickerData as any).guild_id;
        const guild = !guildID ? null : GuildStore.getGuild(guildID);
        const guildNameCleaned = !guild ? "" : sanitizeFilename(guild.name, {});

        // APNG, GIF, & LOTTIE are all considered animated.
        const animated = stickerData.format_type !== StickerFormatType.PNG;
        const isLottie = stickerData.format_type === StickerFormatType.LOTTIE;
        let assetType: AssetType | null = null;
        let stickerSuffix = "";
        let stickerURL = "";
        let mime = "";

        if ([StickerFormatType.APNG, StickerFormatType.PNG].includes(stickerData.format_type)) {
            stickerURL = `${ASSET_MEDIA_PROXY_BASE}/stickers/${stickerID}.png`;
            assetType = animated ? AssetType.APNG_STICKER : AssetType.PNG_STICKER;
            stickerSuffix = animated ? "apng-sticker" : "png-sticker";
            mime = "image/png";
        } else if (stickerData.format_type === StickerFormatType.GIF) {
            stickerURL = `${ASSET_MEDIA_PROXY_BASE}/stickers/${stickerID}.gif`;
            assetType = AssetType.GIF_STICKER;
            stickerSuffix = "gif-sticker";
            mime = "image/gif";
        } else if (stickerData.format_type === StickerFormatType.LOTTIE) {
            stickerURL = `${CDN_BASE}/stickers/${stickerID}.json`;
            assetType = AssetType.LOTTIE_STICKER;
            stickerSuffix = "lottie-sticker";
            mime = "video/lottie+json";
        }

        const stickerNameRaw = stickerData.name;
        const stickerNameDisplay = `:${stickerNameRaw}:`;
        const stickerNameCleaned = sanitizeFilename(stickerNameRaw, {});
        const icon = isLottie ? ImageIcon({ width: 20, height: 20 }) : ImageAsIcon({ src: stickerURL, width: 20, height: 20 });

        items.push(
            <Menu.MenuItem
                id="downloadify-sticker"
                label={`Download ${stickerNameDisplay}`}
                icon={() => icon}
                action={async () => await handleDownload({
                    alias: `${guildNameCleaned ? `${guildNameCleaned}-` : ""}${stickerNameCleaned ? `${stickerNameCleaned}-` : ""}${stickerSuffix}`,
                    animatable: animated,
                    urls: { primary: stickerURL },
                    mime: mime,
                    classifier: assetType,
                    size: null
                })}
            />
        );
    }

    items.length && children.splice(children.length, 0, items);
}

export function EmojiProfileContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: EmojiContextMenuProps) {
    const isMessageEmoji = !!props.messageId;
    const isUnicode = (!!props.alt || !!props.emojiName) && !props.emojiId;
    const isCustom = !!props.emojiId;

    DownloadifyLogger.info(`[${getFormattedNow()}] [PROFILE EMOJI CONTEXT MENU OPENED]\n`, props, event);

    if (isUnicode && !props.alt) {
        const emoji = getUnicodeEmojiData(props.emojiName);
        emoji && (props = { animated: false, emojiName: emoji.name, src: emoji.path });
    }

    if (isMessageEmoji || (!isUnicode && !isCustom) || (isUnicode && isCustom)) {
        return;
    } else {
        event.preventDefault();
        event.stopPropagation();
    }

    const { animated, src } = props;
    const emojiCustomID = props.emojiId ?? null;
    const emojiNameDisplay = props.emojiName.startsWith(":") ? props.emojiName : `:${props.emojiName}:`;
    const emojiNameCleaned = sanitizeFilename(emojiNameDisplay, {});

    const emojiURL = isCustom && emojiCustomID
        ? `${ASSET_MEDIA_PROXY_BASE.origin}/emojis/${emojiCustomID}.${animated ? "gif" : "png"}`
        : isUnicode && src
            ? `${PRIMARY_DOMAIN_BASE.origin}${src}`
            : null;

    if (!emojiURL) {
        return;
    }

    const emojiSuffix = isUnicode ? "unicode-emoji" : "custom-emoji";

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-emoji"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Emoji"
        >
            <Menu.MenuItem
                id="downloadify-emoji"
                label={`Download ${emojiNameDisplay}`}
                icon={() => ImageAsIcon({ src: emojiURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${emojiNameCleaned ? `${emojiNameCleaned}-` : ""}${emojiSuffix}`,
                    animatable: animated,
                    urls: { primary: emojiURL },
                    mime: isUnicode ? "image/svg+xml" : !animated ? "image/png" : "image/gif",
                    classifier: isUnicode ? AssetType.UNICODE_EMOJI : AssetType.CUSTOM_EMOJI,
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

export function ConnectionIconProfileContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: ConnectionIconProfileContextMenuProps) {
    DownloadifyLogger.info(`[${getFormattedNow()}] [PROFILE CONNECTION ICON CONTEXT MENU OPENED]\n`, props, event);

    const profileConnections = ([props.account].concat(props.account.type === "twitter" ? [{ type: "twitter_legacy" }] : [])).map(account => {
        return getConnection(account.type);
    }).filter(account => {
        if (!account) { return false; }
        return true;
    }).map(account => {
        const iconSources = Object.entries(account!.icon).map(([key, value]) => {
            const url = PRIMARY_DOMAIN_BASE.origin + value;
            const formattedName = key
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .split(" ")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            return {
                url: url,
                name: formattedName,
                key,
                png: value.endsWith("png")
            };
        });

        return {
            ...account,
            srcs: iconSources
        };
    });

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-connection-icon"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Connection Icon"
        >
            {[...profileConnections.map(account => {
                return <Menu.MenuItem
                    key={`downloadify-profile-account-${account.name}-connections`}
                    id={`downloadify-profile-account-${account.name}-connections`}
                    label={`Download ${account.name} Icon`}
                >
                    {[...account.srcs.map(icon => {
                        return <Menu.MenuItem
                            key={`downloadify-${account.name}-${icon.key}-account-connection`}
                            id={`downloadify-${account.name}-${icon.key}-account-connection`}
                            label={icon.name}
                            icon={() => ImageAsIcon({ src: icon.url, width: 20, height: 20 })}
                            action={async () => await handleDownload(
                                {
                                    alias: `${account.name}-${icon.key}-account-connection`,
                                    animatable: false,
                                    urls: { primary: icon.url },
                                    mime: icon.png ? "image/png" : "image/svg",
                                    classifier: icon.png ? "image/png" : "image/svg",
                                    size: null
                                }
                            )}
                        />;
                    })]}
                </Menu.MenuItem>;
            })]}
        </Menu.Menu>;
    });
}

export function ConnectionExtrasProfileContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: ConnectionExtrasProfileContextMenuProps) {
    DownloadifyLogger.info(`[${getFormattedNow()}] [PROFILE CONNECTION EXTRA ICON CONTEXT MENU OPENED]\n`, props, event);

    const iconName = props.imageAlt ?? "";
    const iconNameCleaned = sanitizeFilename(iconName, {});
    const iconURL = PRIMARY_DOMAIN_BASE.origin + props.imageSrc;

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-connection-extras-icon"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Connection Extras Icon"
        >
            <Menu.MenuItem
                id={`downloadify-${iconNameCleaned ? `${iconNameCleaned}-` : ""}account-connection`}
                label={`Download ${iconName} Icon`}
                icon={() => ImageAsIcon({ src: iconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${iconNameCleaned ? `${iconNameCleaned}-` : ""}account-connection`,
                    animatable: false,
                    urls: { primary: iconURL },
                    mime: null,
                    classifier: null,
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

export function RoleIconProfileContextMenu(children: Array<any>, props: RoleIconProfileContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [PROFILE ROLE ICON CONTEXT MENU OPENED]\n`, props);

    const roleID = props.id;
    const guildID = SelectedGuildStore.getGuildId();
    const roleData = (roleID && guildID) ? GuildRoleStore.getRole(guildID, roleID) : null;

    if (!roleData) {
        return;
    }

    const roleIconCustom = roleData?.icon;
    const roleIconUnicode = roleData?.unicodeEmoji ? getUnicodeEmojiPath(roleData.unicodeEmoji) : null;
    const roleDataName = roleData?.name ?? "";
    const roleDataNameCleaned = !roleData ? null : sanitizeFilename(roleDataName, {});

    const roleIconURL = roleIconCustom
        ? `${ASSET_MEDIA_PROXY_BASE.origin}/role-icons/${roleID}/${roleIconCustom}.png`
        : roleIconUnicode
            ? `${PRIMARY_DOMAIN_BASE.origin}${roleIconUnicode}`
            : null;

    if (!roleIconURL) {
        return;
    }

    const roleIconMenuItem = [
        roleIconURL ? (
            <Menu.MenuItem
                id="downloadify-role-icon"
                label={`Download ${roleDataName} Role Icon`}
                icon={() => ImageAsIcon({ src: roleIconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${roleDataNameCleaned ? `${roleDataNameCleaned}-` : ""}role-icon`,
                    animatable: false,
                    urls: { primary: roleIconURL },
                    mime: roleIconUnicode ? "image/svg+xml" : "image/png",
                    classifier: roleIconUnicode ? AssetType.UNICODE_ROLE_ICON : AssetType.CUSTOM_ROLE_ICON,
                    size: null
                })}
            />
        ) : null
    ].filter(Boolean);

    children.splice(children.length, 0, roleIconMenuItem);
}

export function RoleIconMessageContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: RoleIconMessageContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [MESSAGE ROLE ICON CONTEXT MENU OPENED]\n`, props, event);

    const roleIconUnicode = props?.unicodeEmoji ? getUnicodeEmojiPath(props.unicodeEmoji.surrogates) : null;
    const roleWithIconName = props?.name ?? "";
    const roleWithIconNameCleaned = !roleWithIconName ? null : sanitizeFilename(roleWithIconName, {});

    const roleIconURL = !roleIconUnicode
        ? props.src
        : roleIconUnicode
            ? `${PRIMARY_DOMAIN_BASE.origin}${roleIconUnicode}`
            : null;

    if (!roleIconURL) {
        return;
    }

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-role-icon"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Role Icon"
        >
            <Menu.MenuItem
                id="downloadify-role-icon"
                label={`Download ${roleWithIconName} Role Icon`}
                icon={() => ImageAsIcon({ src: roleIconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${roleWithIconNameCleaned ? `${roleWithIconNameCleaned}-` : ""}role-icon`,
                    animatable: false,
                    urls: { primary: roleIconURL },
                    mime: roleIconUnicode ? "image/svg+xml" : "image/png",
                    classifier: roleIconUnicode ? AssetType.UNICODE_ROLE_ICON : AssetType.CUSTOM_ROLE_ICON,
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

export function ProfileBadgeContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: ProfileBadgeContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [PROFILE BADGE CONTEXT MENU OPENED]\n`, props, event);

    event.preventDefault();
    event.stopPropagation();

    const { badge, userId } = props;
    const isCustomBadge = !badge.id;
    // Only add user text if it's a custom badge.
    const user = (!userId || !isCustomBadge) ? null : UserStore.getUser(userId);
    const userText = !user ? "" : (user.username.replace(".", "-") + "-");
    const badgeName = isCustomBadge ? badge.description : BadgeNames[badge.id!];
    const badgeNameCleaned = !badgeName ? null : sanitizeFilename(badgeName, {});
    const badgeURL = isCustomBadge ? badge.iconSrc! : (ASSET_MEDIA_PROXY_BASE.origin + "/badge-icons/" + badge.icon + ".png");

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-profile-badge"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Profile Badge"
        >
            {!!(isCustomBadge && badge.description) && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label="Copy Badge Name"
                    action={() => copyWithToast(badge.description!)}
                />
            )}
            {!!(isCustomBadge && badge.iconSrc) && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label="Copy Badge Image Link"
                    action={() => copyWithToast(badge.iconSrc!)}
                />
            )}
            <Menu.MenuItem
                id="downloadify-profile-badge"
                label={`Download ${badgeName} Badge`}
                icon={() => ImageAsIcon({ src: badgeURL, width: 20, height: 20 })}
                action={async () => {
                    await handleDownload({
                        alias: `${userText}${badgeNameCleaned}-profile-badge`,
                        animatable: false,
                        urls: { primary: badgeURL },
                        mime: null,
                        classifier: isCustomBadge ? null : AssetType.PROFILE_BADGE,
                        size: null
                    });
                }}
            />
        </Menu.Menu>;
    });
}

export function ClanBadgeMessageContextMenu(event: React.MouseEvent<HTMLButtonElement>, props: ClanBadgeMessageContextMenuProps): void {
    DownloadifyLogger.info(`[${getFormattedNow()}] [CLAN BADGE CONTEXT MENU OPENED]\n`, props, event);

    const onMembersList = (
        (event.target as HTMLElement).parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.ariaLabel === "Members"
        || (event.target as HTMLElement).parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.ariaLabel === "Members"
    );

    if (onMembersList) {
        return; // Defer to the user-context menu.
    } else {
        event.preventDefault();
        event.stopPropagation();
    }

    const clanBadgeText = props.guildTag;
    const clanBadgeHash = props.guildBadge;
    const clanBadgeGuildID = props.guildId;
    const clanBadgeTextCleaned = !clanBadgeText ? null : clanBadgeText.match(/[^a-z]/gi) ? null : clanBadgeText;

    if (!clanBadgeText || !clanBadgeHash || !clanBadgeGuildID) {
        return;
    }

    const clanBadgeURL = `${ASSET_MEDIA_PROXY_BASE.origin}/clan-badges/${clanBadgeGuildID}/${clanBadgeHash}.png`;

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId="downloadify-clan-badge"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Clan Badge"
        >
            <Menu.MenuItem
                id="downloadify-clan-badge"
                label={`Download ${clanBadgeText} Clan Badge`}
                submenuItemLabel={`${clanBadgeText} Clan Badge`}
                icon={() => ImageAsIcon({ src: clanBadgeURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${clanBadgeTextCleaned ? `${clanBadgeTextCleaned}-` : ""}clan-badge`,
                    animatable: false,
                    urls: { primary: clanBadgeURL },
                    mime: "image/png",
                    classifier: AssetType.CLAN_BADGE,
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

export function UserContextMenu(children: Array<any>, props: UserContextMenuProps): void {
    if (!children?.length || !props.user?.id) {
        return;
    }

    DownloadifyLogger.info(`[${getFormattedNow()}] [USER CONTEXT MENU OPENED]\n`, props);

    const user = UserStore.getUser(props.user.id) as DownloadifyUser;
    const userProfile = UserProfileStore.getUserProfile(user.id) as DownloadifyUserProfile | null;
    const guild = props.guildId ? GuildStore.getGuild(props.guildId) : null;
    const member = (guild ? GuildMemberStore.getMember(guild.id, props.user.id) : null) as DownloadifyMember | null;
    const memberProfile = (guild ? UserProfileStore.getGuildMemberProfile(user.id, guild.id) : null) as DownloadifyUserProfile | null;

    const profileBadges = (userProfile?.badges ?? []).map(badge => {
        const name = BadgeNames[badge.id] ?? badge.id;
        const badgeURL = ASSET_MEDIA_PROXY_BASE.origin + "/badge-icons/" + badge.icon + ".png";
        return { ...badge, name: name, nameCleaned: sanitizeFilename(name, {}), src: badgeURL };
    }).sort((a, b) => {
        return a.name.localeCompare(b.name);
    });

    const seenAccounts = new Set();
    const connectedAccounts = (userProfile?.connectedAccounts ?? []);
    const hasTwitter = connectedAccounts.some(account => account.type === "twitter");

    const profileConnections = (
        connectedAccounts.concat(hasTwitter ? [{ type: "twitter_legacy" } as ConnectedAccount] : [])
    ).map(account => {
        return getConnection(account.type);
    }).filter(account => {
        if (!account || seenAccounts.has(account.name)) { return false; }
        seenAccounts.add(account.name);
        return true;
    }).sort((a, b) => {
        return a!.name.localeCompare(b!.name);
    }).map(account => {
        const iconSources = Object.entries(account!.icon).map(([key, value]) => {
            const url = PRIMARY_DOMAIN_BASE.origin + value;
            const formattedName = key
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .split(" ")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            return {
                url: url,
                name: formattedName,
                key,
                png: value.endsWith("png")
            };
        });

        return {
            ...account,
            srcs: iconSources
        };
    });

    const clanBadgeHash = user.primaryGuild?.badge;
    const clanBadgeGuildID = user.primaryGuild?.identityGuildId;
    const clanBadgeText = user.primaryGuild?.tag;
    const hasClanBade = !!user.primaryGuild?.identityEnabled && !!clanBadgeHash && !!clanBadgeGuildID && !!clanBadgeText;
    const clanBadgeTextCleaned = !hasClanBade ? null : clanBadgeText.match(/[^a-z]/gi) ? null : clanBadgeText;

    const iconRoleID = member?.iconRoleId;
    const roleWithIcon = !iconRoleID ? null : GuildRoleStore.getRole(guild!.id, iconRoleID);
    const roleIconCustom = roleWithIcon?.icon;
    const roleIconUnicode = roleWithIcon?.unicodeEmoji ? getUnicodeEmojiPath(roleWithIcon.unicodeEmoji) : null;
    const roleWithIconName = roleWithIcon?.name ?? "";
    const roleWithIconNameCleaned = !roleWithIcon ? null : sanitizeFilename(roleWithIconName, {});

    const userAvatarHash = user.avatar || null;
    const memberAvatarHash = (() => {
        const memberAvatar = member?.avatar || null;
        return memberAvatar === userAvatarHash ? null : memberAvatar;
    })();

    const userBannerHash = userProfile?.banner || null;
    const memberBannerHash = (() => {
        const guildBanner = memberProfile?.banner || null;
        return guildBanner === userBannerHash ? null : guildBanner;
    })();

    const userNameplateData = user.collectibles?.nameplate || null;
    const userNameplate = (CollectiblesData.getch(userNameplateData?.skuId) || CollectiblesData.getByAsset(userNameplateData?.asset)) as Nameplate | null;
    const userNameplateNameCleaned = userNameplate ? sanitizeFilename(userNameplate.name, {}) : null;
    const memberNameplateData = member?.collectibles?.nameplate || null;
    const memberNameplate = memberNameplateData?.asset === userNameplateData?.asset
        ? null
        : (CollectiblesData.getch(memberNameplateData?.skuId) || CollectiblesData.getByAsset(memberNameplateData?.asset)) as Nameplate | null;
    const memberNameplateNameCleaned = memberNameplate ? sanitizeFilename(memberNameplate.name, {}) : null;

    const userProfileEffectSkuID = userProfile?.profileEffect?.skuId;
    const userProfileEffect = CollectiblesData.getch(userProfileEffectSkuID) as ProfileEffect | null;
    const userProfileEffectNameCleaned = userProfileEffect ? sanitizeFilename(userProfileEffect.name, {}) : null;
    const memberProfileEffectSkuID = memberProfile?.profileEffect?.skuId;
    const memberProfileEffect = memberProfileEffectSkuID === userProfileEffectSkuID
        ? null
        : CollectiblesData.getch(memberProfileEffectSkuID) as ProfileEffect | null;
    const memberProfileEffectNameCleaned = memberProfileEffect ? sanitizeFilename(memberProfileEffect.name, {}) : null;

    const userAvatarDecoration = CollectiblesData.getch(user.avatarDecorationData?.skuId) as AvatarDecoration | null;
    const userAvatarDecorationNameCleaned = userAvatarDecoration ? sanitizeFilename(userAvatarDecoration.name, {}) : null;
    const memberAvatarDecoration = member?.avatarDecoration?.skuId === user.avatarDecorationData?.skuId ? null : CollectiblesData.getch(member?.avatarDecoration?.skuId) as AvatarDecoration | null;
    const memberAvatarDecorationNameCleaned = memberAvatarDecoration ? sanitizeFilename(memberAvatarDecoration.name, {}) : null;

    const userAvatarURL = userAvatarHash ? `${ASSET_MEDIA_PROXY_BASE.origin}/avatars/${user.id}/${userAvatarHash}.png` : null;
    const memberAvatarURL = memberAvatarHash ? `${ASSET_MEDIA_PROXY_BASE.origin}/guilds/${props.guildId}/users/${user.id}/avatars/${memberAvatarHash}.png` : null;
    const userBannerURL = userBannerHash ? `${ASSET_MEDIA_PROXY_BASE.origin}/banners/${user.id}/${userBannerHash}.png` : null;
    const memberBannerURL = memberBannerHash ? `${ASSET_MEDIA_PROXY_BASE.origin}/guilds/${props.guildId}/users/${user.id}/banners/${memberBannerHash}.png` : null;
    const userAvatarDecorationURL = userAvatarDecoration ? `${ASSET_MEDIA_PROXY_BASE.origin}/avatar-decoration-presets/${userAvatarDecoration.asset}.png` : null;
    const memberAvatarDecorationURL = memberAvatarDecoration ? `${ASSET_MEDIA_PROXY_BASE.origin}/avatar-decoration-presets/${memberAvatarDecoration.asset}.png` : null;
    const userNameplateURL = userNameplate ? `${CDN_BASE.origin}/assets/collectibles/${userNameplate.asset}static.png` : null;
    const memberNameplateURL = memberNameplate ? `${CDN_BASE.origin}/assets/collectibles/${memberNameplate.asset}static.png` : null;
    const defaultUserAvatarURL = `${PRIMARY_DOMAIN_BASE.origin}${defaultAssets.DEFAULT_AVATARS[user.discriminator === "0" ? (Math.floor(Number(BigInt(user.id) >> 22n)) % 6) : (Number(user.discriminator) % 5)]}`;
    const clanBadgeURL = hasClanBade ? `${ASSET_MEDIA_PROXY_BASE.origin}/clan-badges/${clanBadgeGuildID}/${clanBadgeHash}.png` : null;
    const roleIconURL = roleIconCustom
        ? `${ASSET_MEDIA_PROXY_BASE.origin}/role-icons/${iconRoleID}/${roleIconCustom}.png`
        : roleIconUnicode
            ? `${PRIMARY_DOMAIN_BASE.origin}${roleIconUnicode}`
            : null;

    const downloadifyItems = [
        profileBadges.length >= 1 ? (
            <Menu.MenuItem
                id="downloadify-profile-badges"
                label="Download Badges"
                submenuItemLabel="Profile Badges"
            >
                {[...profileBadges.map(badge => {
                    return <Menu.MenuItem
                        key={`downloadify-${badge.id}-profile-badge`}
                        id={`downloadify-${badge.id}-profile-badge`}
                        label={badge.name}
                        icon={() => ImageAsIcon({ src: badge.src, width: 20, height: 20 })}
                        action={async () => await handleDownload({
                            alias: `${user.username.replace(".", "-")}-${badge.nameCleaned}-profile-badge`,
                            animatable: false,
                            urls: { primary: badge.src },
                            mime: "image/png",
                            classifier: AssetType.PROFILE_BADGE,
                            size: null
                        })}
                    />;
                })]}
            </Menu.MenuItem>
        ) : null,
        profileConnections.length >= 1 ? (
            <Menu.MenuItem
                id="downloadify-profile-account-connections"
                label="Download Connection Icons"
                submenuItemLabel="Connection Icons"
            >
                {[...profileConnections.map(account => {
                    return <Menu.MenuItem
                        key={`downloadify-profile-account-${account.name}-connections`}
                        id={`downloadify-profile-account-${account.name}-connections`}
                        label={account.name}
                    >
                        {[...account.srcs.map(icon => {
                            return <Menu.MenuItem
                                key={`downloadify-${account.name}-${icon.key}-account-connection`}
                                id={`downloadify-${account.name}-${icon.key}-account-connection`}
                                label={icon.name}
                                icon={() => ImageAsIcon({ src: icon.url, width: 20, height: 20 })}
                                action={async () => await handleDownload({
                                    alias: `${user.username.replace(".", "-")}-${account.name}-${icon.key}-account-connection`,
                                    animatable: false,
                                    urls: { primary: icon.url },
                                    mime: icon.png ? "image/png" : "image/svg",
                                    classifier: icon.png ? "image/png" : "image/svg",
                                    size: null
                                })}
                            />;
                        })]}
                    </Menu.MenuItem>;

                })]}
            </Menu.MenuItem>
        ) : null,
        clanBadgeURL ? (
            <Menu.MenuItem
                id="downloadify-clan-badge"
                label={`Download ${clanBadgeText} Clan Badge`}
                submenuItemLabel={`${clanBadgeText} Clan Badge`}
                icon={() => ImageAsIcon({ src: clanBadgeURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-${clanBadgeTextCleaned ? `${clanBadgeTextCleaned}-` : ""}clan-badge`,
                    animatable: false,
                    urls: { primary: clanBadgeURL },
                    mime: "image/png",
                    classifier: AssetType.CLAN_BADGE,
                    size: null
                })}
            />
        ) : null,
        defaultUserAvatarURL ? (
            <Menu.MenuItem
                id="downloadify-default-user-avatar"
                label="Download Default Avatar"
                submenuItemLabel="Default Avatar"
                icon={() => ImageAsIcon({ src: defaultUserAvatarURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-default-avatar`,
                    animatable: false,
                    urls: { primary: defaultUserAvatarURL },
                    mime: "image/png",
                    classifier: AssetType.DEFAULT_USER_AVATAR,
                    size: null
                })}
            />
        ) : null,
        (profileConnections.length || profileBadges.length || clanBadgeURL || defaultUserAvatarURL) && (userAvatarURL || userBannerURL || userAvatarDecorationURL || userNameplateURL || userProfileEffect)
            ? <Menu.MenuSeparator /> : null,
        userAvatarURL ? (
            <Menu.MenuItem
                id="downloadify-user-avatar"
                label="Download User Avatar"
                submenuItemLabel="User Avatar"
                icon={() => ImageAsIcon({ src: userAvatarURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-avatar`,
                    animatable: !!userAvatarHash?.startsWith("a_"),
                    urls: { primary: userAvatarURL },
                    mime: "image/png",
                    classifier: AssetType.USER_AVATAR,
                    size: null
                })}
            />
        ) : null,
        userBannerURL ? (
            <Menu.MenuItem
                id="downloadify-user-banner"
                label="Download User Banner"
                submenuItemLabel="User Banner"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-banner`,
                    animatable: !!userBannerHash?.startsWith("a_"),
                    urls: { primary: userBannerURL },
                    mime: "image/png",
                    classifier: AssetType.USER_BANNER,
                    size: null
                })}
            />
        ) : null,
        userAvatarDecorationURL ? (
            <Menu.MenuItem
                id="downloadify-user-avatar-decoration"
                label={`Download ${userAvatarDecoration!.name} Decoration`}
                submenuItemLabel={`${userAvatarDecoration!.name} Decoration`}
                icon={() => ImageAsIcon({ src: userAvatarDecorationURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-${userAvatarDecorationNameCleaned ? `${userAvatarDecorationNameCleaned}-` : ""}avatar-decoration`,
                    animatable: true,
                    urls: { primary: userAvatarDecorationURL },
                    mime: "image/png",
                    classifier: AssetType.AVATAR_DECORATION,
                    size: null
                })}
            />
        ) : null,
        userNameplateURL ? (
            <Menu.MenuItem
                id="downloadify-user-nameplate"
                label={`Download ${userNameplate!.name} Nameplate`}
                submenuItemLabel={`${userNameplate!.name} Nameplate`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-${userNameplateNameCleaned ? `${userNameplateNameCleaned}-` : ""}nameplate`,
                    animatable: true,
                    urls: { primary: userNameplateURL },
                    mime: "image/png",
                    classifier: AssetType.NAMEPLATE,
                    size: null
                })}
            />
        ) : null,
        userProfileEffect ? (
            <Menu.MenuItem
                id="downloadify-user-profile-effect"
                label={`Download ${userProfileEffect.name} Effect`}
                submenuItemLabel={`${userProfileEffect.name} Effect`}
            >
                <Menu.MenuItem
                    id="downloadify-user-profile-effect-thumbnail"
                    label="Thumbnail"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${user.username.replace(".", "-")}-${userProfileEffectNameCleaned ? `${userProfileEffectNameCleaned}-` : ""}profile-effect-thumbnail`,
                        animatable: false,
                        urls: { primary: userProfileEffect.thumbnailPreviewSrc },
                        mime: "image/png",
                        classifier: AssetType.PROFILE_EFFECT_THUMBNAIL,
                        size: null,
                    })}
                />
                <Menu.MenuItem
                    id="downloadify-user-profile-effect-primary"
                    label="Primary"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${user.username.replace(".", "-")}-${userProfileEffectNameCleaned ? `${userProfileEffectNameCleaned}-` : ""}profile-effect-primary`,
                        animatable: true,
                        urls: { primary: userProfileEffect.effects[0].src },
                        mime: "image/png",
                        classifier: AssetType.PROFILE_EFFECT_PRIMARY,
                        size: null,
                    })}
                />
                <Menu.MenuItem
                    id="downloadify-user-profile-effect-secondary"
                    label="Secondary"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${user.username.replace(".", "-")}-${userProfileEffectNameCleaned ? `${userProfileEffectNameCleaned}-` : ""}profile-effect-secondary`,
                        animatable: true,
                        urls: { primary: userProfileEffect.effects[1].src },
                        mime: "image/png",
                        classifier: AssetType.PROFILE_EFFECT_SECONDARY,
                        size: null,
                    })}
                />
            </Menu.MenuItem>
        ) : null,
        (defaultUserAvatarURL || userAvatarURL || userBannerURL || userAvatarDecorationURL || userNameplateURL || userProfileEffect) && (roleIconURL || memberAvatarURL || memberBannerURL || memberAvatarDecorationURL || memberNameplateURL || memberProfileEffect)
            ? <Menu.MenuSeparator /> : null,
        memberAvatarURL ? (
            <Menu.MenuItem
                id="downloadify-member-avatar"
                label="Download Member Avatar"
                submenuItemLabel="Member Avatar"
                icon={() => ImageAsIcon({ src: memberAvatarURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: guild ? `${guild.name}-${user.username.replace(".", "-")}-avatar` : `${user.username.replace(".", "-")}-avatar`,
                    animatable: !!memberAvatarHash?.startsWith("a_"),
                    urls: { primary: memberAvatarURL },
                    mime: "image/png",
                    classifier: AssetType.USER_AVATAR,
                    size: null
                })}
            />
        ) : null,
        memberBannerURL ? (
            <Menu.MenuItem
                id="downloadify-member-banner"
                label="Download Member Banner"
                submenuItemLabel="Member Banner"
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: guild ? `${guild.name}-${user.username.replace(".", "-")}-banner` : `${user.username.replace(".", "-")}-banner`,
                    animatable: !!memberBannerHash?.startsWith("a_"),
                    urls: { primary: memberBannerURL },
                    mime: "image/png",
                    classifier: AssetType.USER_BANNER,
                    size: null
                })}
            />
        ) : null,
        memberAvatarDecorationURL ? (
            <Menu.MenuItem
                id="downloadify-member-avatar-decoration"
                label={`Download ${memberAvatarDecoration!.name} Decoration`}
                submenuItemLabel={`${memberAvatarDecoration!.name} Decoration`}
                icon={() => ImageAsIcon({ src: memberAvatarDecorationURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${guild ? `${sanitizeFilename(guild.name, {}) || guild.id}-` : ""}${user.username.replace(".", "-")}-${memberAvatarDecorationNameCleaned ? `${memberAvatarDecorationNameCleaned}-` : ""}avatar-decoration`,
                    animatable: true,
                    urls: { primary: memberAvatarDecorationURL },
                    mime: "image/png",
                    classifier: AssetType.AVATAR_DECORATION,
                    size: null
                })}
            />
        ) : null,
        memberNameplateURL ? (
            <Menu.MenuItem
                id="downloadify-member-nameplate"
                label={`Download ${memberNameplate!.name} Nameplate`}
                submenuItemLabel={`${memberNameplate!.name} Nameplate`}
                icon={() => ImageIcon({ width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${guild ? `${sanitizeFilename(guild.name, {}) || guild.id}-` : ""}${user.username.replace(".", "-")}${memberNameplateNameCleaned ? `${memberNameplateNameCleaned}-` : ""}-nameplate`,
                    animatable: true,
                    urls: { primary: memberNameplateURL },
                    mime: "image/png",
                    classifier: AssetType.NAMEPLATE,
                    size: null
                })}
            />
        ) : null,
        memberProfileEffect ? (
            <Menu.MenuItem
                id="downloadify-member-profile-effect"
                label={`Download ${memberProfileEffect.name} Effect`}
                submenuItemLabel={`${memberProfileEffect.name} Effect`}
            >
                <Menu.MenuItem
                    id="downloadify-member-profile-effect-thumbnail"
                    label="Thumbnail"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${guild ? `${sanitizeFilename(guild.name, {}) || guild.id}-` : ""}${user.username.replace(".", "-")}-${memberProfileEffectNameCleaned ? `${memberProfileEffectNameCleaned}-` : ""}profile-effect-thumbnail`,
                        animatable: false,
                        urls: { primary: memberProfileEffect.thumbnailPreviewSrc },
                        mime: "image/png",
                        classifier: AssetType.PROFILE_EFFECT_THUMBNAIL,
                        size: null,
                    })}
                />
                <Menu.MenuItem
                    id="downloadify-member-profile-effect-primary"
                    label="Primary"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${guild ? `${sanitizeFilename(guild.name, {}) || guild.id}-` : ""}${user.username.replace(".", "-")}-${memberProfileEffectNameCleaned ? `${memberProfileEffectNameCleaned}-` : ""}profile-effect-primary`,
                        animatable: true,
                        urls: { primary: memberProfileEffect.effects[0].src },
                        mime: "image/png",
                        classifier: AssetType.PROFILE_EFFECT_PRIMARY,
                        size: null,
                    })}
                />
                <Menu.MenuItem
                    id="downloadify-member-profile-effect-secondary"
                    label="Secondary"
                    icon={() => ImageIcon({ width: 20, height: 20 })}
                    action={async () => await handleDownload({
                        alias: `${guild ? `${sanitizeFilename(guild.name, {}) || guild.id}-` : ""}${user.username.replace(".", "-")}-${memberProfileEffectNameCleaned ? `${memberProfileEffectNameCleaned}-` : ""}profile-effect-secondary`,
                        animatable: true,
                        urls: { primary: memberProfileEffect.effects[1].src },
                        mime: "image/png",
                        classifier: AssetType.PROFILE_EFFECT_SECONDARY,
                        size: null,
                    })}
                />
            </Menu.MenuItem>
        ) : null,
        roleIconURL ? (
            <Menu.MenuItem
                id="downloadify-role-icon"
                label={`Download ${roleWithIconName} Role Icon`}
                submenuItemLabel={`${roleWithIconName} Role Icon`}
                icon={() => ImageAsIcon({ src: roleIconURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${user.username.replace(".", "-")}-${roleWithIconNameCleaned ? `${roleWithIconNameCleaned}-` : ""}role-icon`,
                    animatable: false,
                    urls: { primary: roleIconURL },
                    mime: roleIconUnicode ? "image/svg+xml" : "image/png",
                    classifier: roleIconUnicode ? AssetType.UNICODE_ROLE_ICON : AssetType.CUSTOM_ROLE_ICON,
                    size: null
                })}
            />
        ) : null
    ].filter(Boolean);

    joinOrCreateContextMenuGroup(
        children,
        downloadifyItems,
        "user-content-group",
        "downloadify-submenu",
        "Download",
        [{
            id: { child: "devmode-copy-id" },
            type: "WITH_GROUP",
            position: "START"
        },
        {
            id: { child: "user-profile" },
            type: "WITH_GROUP",
            position: "END"
        }]
    );
}

export async function handleExpandedModalDownloadButtonClicked(props: ExpandedModalDownloadProps): Promise<void> {
    DownloadifyLogger.info(`[${getFormattedNow()}] [EXPANDED MODAL DOWNLOAD CLICKED]\n`, props);
    const { url, original, sourceMetadata, contentType, srcIsAnimated } = props.item;

    await handleDownload(
        {
            alias: sourceMetadata?.identifier.title ?? "",
            animatable: !!srcIsAnimated,
            urls: { primary: url, secondary: original },
            mime: contentType,
            classifier: contentType,
            size: sourceMetadata?.identifier.size ?? 0
        }
    );
}

export async function handleHoverDownloadButtonClicked(props: HoverDownloadProps): Promise<void> {
    DownloadifyLogger.info(`[${getFormattedNow()}] [HOVER DOWNLOAD CLICKED]\n`, props);
    const { type, downloadUrl, originalItem, contentType, srcIsAnimated } = props.item;

    await handleDownload(
        {
            alias: originalItem.title || "",
            animatable: !!srcIsAnimated,
            urls: { primary: type === "IMAGE" ? originalItem.proxy_url : downloadUrl },
            mime: contentType,
            classifier: contentType,
            size: originalItem.size
        }
    );
}

export function VoiceMessageDownloadButton(props: VoiceMessageDownloadButtonProps): JSX.Element {
    async function voiceMessageDownloadClicked(event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        DownloadifyLogger.info(`[${getFormattedNow()}] [VOICE MESSAGE DOWNLOAD CLICKED]\n`, props);
        const { item, message } = props;

        await handleDownload(
            {
                alias: `${message.author.username.replace(".", "-")}-voice-message-${message.id}`,
                animatable: false,
                urls: { primary: item.originalItem.proxy_url },
                mime: item.contentType,
                classifier: AssetType.VOICE_MESSAGE,
                size: item.originalItem.size
            }
        );
    }

    const { voiceMessages } = settings.use(["voiceMessages"]);

    return (
        <>
            {voiceMessages && <div className={d("voice-message-container")}>
                <button
                    onClick={voiceMessageDownloadClicked}
                    className={d("voice-message-button")}
                    aria-label="Download Voice Message"
                    rel="noreferrer noopener"
                >
                    {DownloadIcon({ width: 20, height: 20 })}
                </button>
            </div>}
        </>
    );
}

export function SVGIconContextMenu(event: React.MouseEvent<HTMLButtonElement>, name: string): void {
    name = typeof name === "string" ? name : "SVG";
    DownloadifyLogger.info(`[${getFormattedNow()}] [${name.toUpperCase()} ICON CONTEXT MENU OPENED]\n`, event);

    const svgElement = (event.target as HTMLElement).closest("svg");

    if (!svgElement) {
        return;
    } else {
        event.preventDefault();
        event.stopPropagation();
    }

    const svgURL = SVG2URL(svgElement);

    return ContextMenuApi.openContextMenu(event, () => {
        return <Menu.Menu
            navId={`downloadify-${name.toLowerCase()}-icon`}
            onClose={ContextMenuApi.closeContextMenu}
            aria-label={`${name} Icon`}
        >
            <Menu.MenuItem
                id={`downloadify-${name.toLowerCase()}-icon`}
                label={`Download ${name} Icon`}
                icon={() => ImageAsIcon({ src: svgURL, width: 20, height: 20 })}
                action={async () => await handleDownload({
                    alias: `${name.toLowerCase()}-icon`,
                    animatable: false,
                    urls: { primary: svgURL },
                    mime: "image/svg+xml",
                    classifier: AssetType.DATA_SVG,
                    size: null
                })}
            />
        </Menu.Menu>;
    });
}

/** Handle file download and progress toasts. */
async function handleDownload(asset: AssetInfo): Promise<void> {
    DownloadifyLogger.info(`[${getFormattedNow()}] [DOWNLOAD STARTED]\n`, asset);
    const toastStarted = asset.size && fileThreshold(asset.size, 15);
    toastStarted && settings.store.displayStatus && showToast("Download Started", Toasts.Type.MESSAGE, { duration: settings.store.statusDuration * 1000 });

    const result = await DownloadifyNative.download(
        asset,
        settings.store.overwriteFiles,
        settings.store.allowUnicode
    );

    result.logger && result.log && DownloadifyLogger[result.logger](`[${getFormattedNow()}] ${result.log}`);
    settings.store.displayStatus && result.toast && showToast(result.toast, result.type, { duration: settings.store.statusDuration * result.mod });
}
