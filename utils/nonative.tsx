/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { classNameFactory } from "@api/Styles";
import { Logger } from "@utils/index";
import { PluginNative } from "@utils/types";
import { findByPropsLazy, findLazy, findStoreLazy } from "@webpack";
import { EmojiStore, Menu, RestAPI } from "@webpack/common";
import { JSX } from "react";

import { Collectible, CollectibleType, CUSTOM_EMOJI_EXTRACTOR, DefaultAssets, ExternalConnection, ExtractedCustomEmoji, ExtractedEmojis, InsertGroup, UNICODE_EMOJI_EXTRACTOR, UnicodeEmojiData, UNRESOLVED_UNICODE_EMOJI_EXTRACTOR } from "./definitions";
import { getFormattedNow, sanitizeCollectible } from "./misc";

export const d = classNameFactory("downloadify-");
export const DownloadifyNative = VencordNative.pluginHelpers.Downloadify as PluginNative<typeof import("../native")>;
export const defaultAssets = findByPropsLazy("DEFAULT_GROUP_DM_AVATARS") as DefaultAssets;
export const DownloadifyLogger = new Logger("Downloadify");
export const emojiData = findLazy(m => m.emojis && Array.isArray(m.emojis));
export const ApplicationStore = findStoreLazy("ApplicationStore");
export const ProfileEffectStore = findStoreLazy("ProfileEffectStore");
export const InviteStore = findStoreLazy("InviteStore");
export const CollectiblesCategoryStore = findStoreLazy("CollectiblesCategoryStore");
const connectionData = findLazy(m => m.getByUrl && m.isSupported);

export const getConnection = (connection: string): null | ExternalConnection => {
    return connectionData.get(connection);
};

export function DownloadIcon({ width, height }: { width: number; height: number; }): JSX.Element {
    return (
        <svg
            className={d("-download-icon")}
            role="img"
            width={width}
            height={height}
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <path
                d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z"
            />
        </svg>
    );
}

export function ImageAsIcon({ src, width, height }: { src: string, width: number; height: number; }): JSX.Element {
    return (
        <img src={src} width={width} height={height}></img>
    );
}

class CollectiblesDataManager {
    private cache: Record<string, Collectible> = {};
    private pending: Map<string, Promise<Collectible | null>> = new Map();
    private invalid: Set<string> = new Set();
    private suspended: boolean = false;
    private errors: number = 0;

    /**
     * Set a SKU's product details.
     */
    set(skuId: string, product: Collectible | null): void {
        if (!product || !skuId) { return; }
        this.cache[skuId] = product;
    }

    /**
     * Get a SKU's product details, or null if not cached.
     */
    get(skuId: string | null | undefined): Collectible | null {
        if (!skuId) { return null; }
        return this.cache[skuId] ?? null;
    }

    /**
     * Get details for a product matching a specific asset string, or null if not found in the cache.
     */
    getByAsset(asset: string | null | undefined): Collectible | null {
        if (!asset) { return null; }
        return Object.values(this.cache).find(product => product && "asset" in product && product.asset === asset) || null;
    }

    /**
     * Get a SKU's product details if cached, else
     * fetch it for later and return null for now.
     */
    getch(skuId: string | null | undefined): Collectible | null {
        if (!skuId) { return null; }
        if (this.cache[skuId]) { return this.cache[skuId]; }
        if (this.invalid.has(skuId)) { return null; }
        if (this.pending.has(skuId)) { return null; }
        this.fetch(skuId);
        return null;
    }

    /**
     * Check if a product is a Nameplate, Avatar Decoration, or Profile Effect.
     */
    isNAP(product: any): boolean {
        return [
            CollectibleType.NAMEPLATE,
            CollectibleType.AVATAR_DECORATION,
            CollectibleType.PROFILE_EFFECT
        ].includes(product?.type);
    }

    /**
     * Get a SKU's product details if cached, else
     * fetch it immediately, returning null if not found.
     */
    async fetch(skuId: string | null | undefined, force: boolean = false): Promise<Collectible | null> {
        if (!skuId) { return null; }
        if ((!force || this.suspended) && this.cache[skuId]) { return this.cache[skuId]; }
        if (!force && this.invalid.has(skuId)) { return null; }
        if (this.suspended) { return null; }
        if (this.pending.has(skuId)) { return this.pending.get(skuId)!; }

        const fetchPromise = this.fetchAndCache(skuId);
        this.pending.set(skuId, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            this.pending.delete(skuId);
        }
    }

    private async fetchAndCache(skuId: string): Promise<Collectible | null> {
        try {
            const response = await RestAPI.get({
                url: `/collectibles-products/${skuId}`
            });

            if (response.body && response.body.sku_id) {
                const listing = response.body;

                if (!this.isNAP(listing)) {
                    this.invalid.add(skuId);
                    return null;
                }

                const item = listing.items[0] as Collectible;
                const product = sanitizeCollectible({ ...item, name: listing.name });
                product && (this.cache[response.body.sku_id] = product);
                return product;
            } else {
                DownloadifyLogger.warn(`[${getFormattedNow()}] [INVALID RESPONSE FOR SKU LOOKUP]\n${skuId}\n`, response);
                this.invalid.add(skuId);
                return null;
            }
        } catch (error: any) {
            if (error?.status === 404) {
                // Cache 404 errors specifically as invalid SKUs.
                DownloadifyLogger.info(`[${getFormattedNow()}] [SKU NOT FOUND]\n${skuId}\n`, error);
                this.invalid.add(skuId);
                return null;
            }

            this.errors += 1;
            DownloadifyLogger.warn(`[${getFormattedNow()}] [FAILED TO FETCH SKU DATA]\n${skuId}\n`, error);

            if (this.errors >= 5) {
                this.suspended = true;
                DownloadifyLogger.warn(`[${getFormattedNow()}] [MAXIMUM COLLECTIBLE FETCH ERRORS REACHED. SUSPENDING FETCHABILITY]\n`, error);
            }

            return null;
        }
    }
}

export const CollectiblesData = new CollectiblesDataManager();

/**
 * Get the data of a Unicode Emoji.
 */
export function getUnicodeEmojiData(emoji: string): UnicodeEmojiData | null {
    const emojiAlias = EmojiStore.getDisambiguatedEmojiContext().unicodeAliases[emoji];
    emojiAlias && (emoji = emojiAlias);

    const emojiID = emojiData.surrogateToEmoji[emoji];
    const emojiObj = (!emojiID ? EmojiStore.getDisambiguatedEmojiContext().emojisByName[emoji] : ((EmojiStore.getDisambiguatedEmojiContext() as any).disambiguatedEmoji[emojiID])) || null;

    return (emojiObj?.type !== 0) ? null : {
        name: emojiObj.uniqueName,
        path: emojiObj.url,
        emoji: emojiObj.surrogates,
        aliases: emojiObj.emojiObject?.names || [],
    };
}

/**
 * Get the SVG path of a Unicode Emoji.
 */
export function getUnicodeEmojiPath(emoji: string): string | null {
    const emojiObj = getUnicodeEmojiData(emoji);
    const emojiURL = emojiObj?.path as string | undefined;
    return emojiURL ?? null;
}

/**
 * Extracts all Unicode and custom emojis from a string.
 */
export function extractEmojis(content: string): ExtractedEmojis {
    if (!content) {
        return { unicode: [], custom: [] };
    }

    const seenEmojis = new Set();
    const customEmojis: ExtractedCustomEmoji[] = [];
    const unicodeEmojis: UnicodeEmojiData[] = [];

    for (const match of content.matchAll(CUSTOM_EMOJI_EXTRACTOR)) {
        const animated = !!match.groups?.animated;
        const id = match.groups?.id ?? null;
        const name = match.groups?.name ?? null;

        if (!id || !name || seenEmojis.has(id)) {
            continue;
        }

        seenEmojis.add(id);
        customEmojis.push({ animated, name, id });
    }

    const unicodeMatches = content.matchAll(UNICODE_EMOJI_EXTRACTOR);
    const unresolvedUnicodeMatches = content.matchAll(UNRESOLVED_UNICODE_EMOJI_EXTRACTOR);
    const allUnicodeMatches = [...unicodeMatches, ...unresolvedUnicodeMatches];

    for (const match of allUnicodeMatches) {
        if (match.index === undefined || !match[1]) continue;

        const emojiString = match[1];
        const emojiData = getUnicodeEmojiData(emojiString);

        if (!emojiData || seenEmojis.has(emojiString)) {
            continue;
        }

        seenEmojis.add(emojiString);
        unicodeEmojis.push(emojiData);
    }

    customEmojis.sort((a, b) => a.name.localeCompare(b.name));
    unicodeEmojis.sort((a, b) => a.name.localeCompare(b.name));

    return {
        unicode: unicodeEmojis,
        custom: customEmojis,
    };
}

/**
 * Join or create a group in the guild context menu.
 */
export function joinOrCreateContextMenuGroup(
    children: Array<any>,
    items: Array<any>,
    groupId: string,
    submenuId?: string,
    submenuLabel?: string,
    insertOrder?: InsertGroup[],
    forceSubmenu: boolean = false
) {
    function joinOrCreateSubmenu() {
        const existingItemShouldJoinSubmenu = existingGroup.props.children.find(child => child?.props?.submenuId === submenuId);
        let existingSubmenu = existingGroup.props.children.find(child => child?.props?.id === submenuId);
        let numitems = items.length;

        if (existingItemShouldJoinSubmenu) {
            existingSubmenu = null;
            items.unshift(existingItemShouldJoinSubmenu);
            numitems++;
            const indexOfExistingItemShouldJoinSubmenu = existingGroup.props.children.findIndex(child => child === existingItemShouldJoinSubmenu);
            existingGroup.props.children.splice(indexOfExistingItemShouldJoinSubmenu, 1);
        }

        if (existingSubmenu) {
            if (!Array.isArray(existingSubmenu.props.children)) {
                existingSubmenu.props.children = [existingSubmenu.props.children];
            }

            items.forEach(member => member.props.label = member.props.submenuItemLabel ?? member.props.label);
            existingSubmenu.props.children.push(...items);
        } else if (numitems === 1 && !forceSubmenu) {
            if (!chosenInsertOption?.position || chosenInsertOption.position === "END") {
                existingGroup.props.children.push(items[0]);
            } else {
                existingGroup.props.children.unshift(items[0]);
            }
        } else {
            existingSubmenu = (
                <Menu.MenuItem
                    id={submenuId as string}
                    label={submenuLabel}
                >
                    {[...items]}
                </Menu.MenuItem>
            );

            items.forEach(member => member.props.label = member.props.submenuItemLabel ?? member.props.label);

            if (!chosenInsertOption?.position || chosenInsertOption.position === "END") {
                existingGroup.props.children.push(existingSubmenu);
            } else {
                existingGroup.props.children.unshift(existingSubmenu);
            }
        }
    }

    items.forEach(member => {
        member.props.groupId = groupId;
        member.props.submenuId = submenuId;
        member.props.submenuLabel = submenuLabel;
    });

    const insertWithOptions = insertOrder?.filter(item => item.type === "WITH_GROUP");
    let existingGroup = children.find(child => child?.props?.id === groupId);
    let chosenInsertOption;

    if (!existingGroup && insertWithOptions) {
        let targetItem;

        for (const item of insertWithOptions) {
            if (item.id.group) {
                targetItem = children.find(child => child?.props?.id === item.id.group);
            }

            if (!targetItem && item.id.child) {
                targetItem = findGroupChildrenByChildId(item.id.child, children, true);
            }

            if (targetItem) {
                existingGroup = children.find(child => child?.props?.children === targetItem);
                chosenInsertOption = item;
                break;
            }
        }
    }

    if (existingGroup) {
        if (!Array.isArray(existingGroup.props.children)) {
            existingGroup.props.children = [existingGroup.props.children];
        }

        if (!submenuId) {
            if (!chosenInsertOption?.position || chosenInsertOption.position === "END") {
                existingGroup.props.children.push(...items);
            } else {
                existingGroup.props.children.unshift(...items);
            }

            return;
        } else {
            joinOrCreateSubmenu();
        }
    } else {
        if (!submenuId) {
            existingGroup = (
                <Menu.MenuGroup id={groupId}>
                    {[...items]}
                </Menu.MenuGroup>
            );
        } else {
            existingGroup = (<Menu.MenuGroup id={groupId}>{[]}</Menu.MenuGroup>);
            joinOrCreateSubmenu();
        }

        const insertAfterBeforeOptions = insertOrder?.filter(item => item.type !== "WITH_GROUP") || [];
        let targetIndex = children.length;
        let targetItem;

        for (const item of insertAfterBeforeOptions) {
            if (item.id.group) {
                targetItem = children.find(child => child?.props?.id === item.id.group);
            }

            if (!targetItem && item.id.child) {
                targetItem = findGroupChildrenByChildId(item.id.child, children, true);
            }

            if (targetItem) {
                targetIndex = children.findIndex(child => child?.props?.children === targetItem);

                if (item.type === "AFTER_GROUP") {
                    targetIndex++;
                }

                break;
            }
        }

        children.splice(targetIndex, 0, existingGroup);
    }
}
