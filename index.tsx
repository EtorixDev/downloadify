/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import definePlugin from "@utils/types";
import { RestAPI } from "@webpack/common";

import { settings } from "./settings";
import { Collectible, ProfileEffect } from "./utils/definitions";
import { ChannelContextMenu, ClanBadgeMessageContextMenu, ConnectionExtrasProfileContextMenu, ConnectionIconProfileContextMenu, EmojiProfileContextMenu, ExpressionPickerContextMenu, GDMContextMenu, GuildContextMenu, handleExpandedModalDownloadButtonClicked, handleHoverDownloadButtonClicked, MessageContextMenu, OrbsPopoutShopImageContextMenu, ProfileBadgeContextMenu, QuestRewardContextMenu, QuestTileContextMenu, RoleIconMessageContextMenu, RoleIconProfileContextMenu, ShopCategoryHeaderContextMenu, ShopListingContextMenu, SVGIconContextMenu, UserContextMenu, VoiceMessageDownloadButton } from "./utils/handlers";
import { sanitizeCollectible } from "./utils/misc";
import { CollectiblesCategoryStore, CollectiblesData } from "./utils/nonative";

export default definePlugin({
    name: "Downloadify",
    description: "Download various assets directly in Discord without having to open a browser or dig through HTML.",
    authors: [{ name: "Etorix", id: 94597845868355584n }],
    hidden: IS_WEB,
    settings,

    CollectiblesData,
    SVGIconContextMenu,
    ShopListingContextMenu,
    EmojiProfileContextMenu,
    ProfileBadgeContextMenu,
    CollectiblesCategoryStore,
    RoleIconMessageContextMenu,
    VoiceMessageDownloadButton,
    ClanBadgeMessageContextMenu,
    ShopCategoryHeaderContextMenu,
    QuestRewardContextMenu,
    OrbsPopoutShopImageContextMenu,
    ConnectionIconProfileContextMenu,
    handleHoverDownloadButtonClicked,
    ConnectionExtrasProfileContextMenu,
    handleExpandedModalDownloadButtonClicked,

    contextMenus: {
        "message": MessageContextMenu,
        "gdm-context": GDMContextMenu,
        "dev-context": RoleIconProfileContextMenu,
        "user-context": UserContextMenu,
        "guild-context": GuildContextMenu,
        "channel-context": ChannelContextMenu,
        "thread-context": ChannelContextMenu,
        "quests-entry": QuestTileContextMenu,
        "expression-picker": ExpressionPickerContextMenu,
    },

    patches: [
        {
            // Adds a context menu to shop listings.
            find: "productName)})",
            replacement: {
                match: /(?<=ref:\i,)(onClick:)/,
                replace: "onContextMenu:(event)=>{$self.ShopListingContextMenu(event,arguments[0].product,arguments[0].cardRef?.current)},$1"
            }
        },
        {
            // Adds a context menu to the shop featured category hero headers.
            find: 'location:"HeroBlock"',
            replacement: {
                match: /(?<=,\i=(\i)=>{var \i;.{0,3000}?heroBlock,)/,
                replace: "onContextMenu:(event)=>{$self.ShopCategoryHeaderContextMenu(event,$self.CollectiblesCategoryStore.getCategory($1.heroBlock?.categorySkuId))},"
            }
        },
        {
            // Adds a context menu to the shop featured category preview headers.
            find: "featuredBlock,innerRef",
            replacement: {
                match: /(?<=let \i,{category:\i,subblock:(\i).{0,500}?featuredBlock,innerRef:\i,)/,
                replace: "onContextMenu:(event)=>{$self.ShopCategoryHeaderContextMenu(event,$self.CollectiblesCategoryStore.getCategoryByStoreListingId($1.categoryStoreListingId))},"
            }
        },
        {
            // Adds a context menu to the all-shop category floating headers.
            find: "categoryWrapper,",
            replacement: {
                match: /(?<=categoryWrapper,)/,
                replace: "onContextMenu:(event)=>{$self.ShopCategoryHeaderContextMenu(event,arguments[0].category)},"
            }
        },
        {
            // Adds a context menu to the product previews at the bottom of the shop.
            find: "jumbleWrapper,",
            replacement: {
                match: /(?<=map\(\((\i).{0,215}?asset,)/,
                replace: "onContextMenu:(event)=>{$self.ShopListingContextMenu(event,$self.CollectiblesCategoryStore.getProduct($1.skuId)??null,null)},"
            }
        },
        {
            find: "let{premiumSince:",
            group: true,
            replacement: [
                {
                    // Adds a context menu to the owner icon.
                    match: /(?<=ownerIcon)/,
                    replace: ",onContextMenu:(event)=>{$self.SVGIconContextMenu(event,'Owner')},"
                },
                {
                    // Adds a context menu to the booster icon.
                    match: /(?=tabIndex:-1)/,
                    replace: "onContextMenu:(event)=>{$self.SVGIconContextMenu(event,'Booster')},"
                }
            ]
        },
        {
            // Adds a context menu to the orbs balance icon.
            find: '="balance-widget-pill"',
            replacement: {
                match: /(?<=orbIconloading:void 0\),)/,
                replace: "onContextMenu:(event)=>{$self.SVGIconContextMenu(event,'Orbs')},"
            }
        },
        {
            // Adds a context menu to the orbs balance to shop button orbs image.
            find: "orbAsset,children",
            replacement: {
                match: /(?<=source",{src:(\i.\i).{0,50}?src:(\i.\i).{0,50}?\]}\))/,
                replace: ",onContextMenu:(event)=>{$self.OrbsPopoutShopImageContextMenu(event,{static:$2,animated:$1})},"
            }
        },
        {
            // Adds a context menu to Quest Reward preview logos.
            find: "\"webp\",width",
            group: true,
            replacement: [
                {
                    match: /(?<="img",{)/,
                    replace: "onContextMenu:(event)=>{$self.QuestRewardContextMenu(event,arguments[0].imageAsset?.asset?.url??arguments[0].videoAsset?.asset?.url)},"
                },
                {
                    match: /(?=autoPlay:)/,
                    replace: "onContextMenu:(event)=>{$self.QuestRewardContextMenu(event,arguments[0].imageAsset?.asset?.url??arguments[0].videoAsset?.asset?.url)},"
                }
            ]
        },
        {
            // Adds a context menu to the SVG icons on the tabs in DMs.
            find: "avatarWithText}",
            replacement: {
                match: /(?=children.{0,100}?color:"currentColor"}\),name:(\i),)/,
                replace: "onContextMenu:(event)=>{$self.SVGIconContextMenu(event,$1.props?.children??$1)},"
            }
        },
        {
            // Adds a context menu to emojis anywhere that isn't message content (profiles, reactions, etc).
            // Message emojis are handled by the message-context handler.
            find: "jumboable:\"jumbo\"",
            replacement: {
                match: /(?="data-type")/,
                replace: "onContextMenu:(event)=>{$self.EmojiProfileContextMenu(event,arguments[0])},"
            }
        },
        {
            // Adds a context menu to connection icons on profiles.
            // This patch is lazy loaded. You must open a profile full-size for it to resolve.
            find: "lightPNG})",
            replacement: {
                match: /(?<=platformIconContainer,)/,
                replace: "onContextMenu:(event)=>{$self.ConnectionIconProfileContextMenu(event,arguments[0])},"
            }
        },
        {
            // Adds a context menu to connection extras, such as TF2 for steam connections.
            find: "connectedAccountVanityMetadataItem,",
            replacement: {
                match: /(?<=connectedAccountVanityMetadataItemIcon)/,
                replace: ",onContextMenu:(event)=>{$self.ConnectionExtrasProfileContextMenu(event,arguments[0])},"
            }
        },
        {
            // Adds a context menu to clan badges on messages and profiles.
            find: "chipletContainerInline,null!=",
            replacement: {
                match: /(?=className:\i\(\)\(\i.chipletContainerInner)/,
                replace: "onContextMenu:(event)=>{$self.ClanBadgeMessageContextMenu(event,arguments[0])},"
            }
        },
        {
            // Adds a context menu to role icons on messages.
            find: "allNamesString,className",
            replacement: {
                match: /(?<={onClick:(\i),)/,
                replace: "onContextMenu:(event)=>{$self.RoleIconMessageContextMenu(event,arguments[0])},"
            }
        },
        {
            // Adds a context menu to profile badges.
            find: "0,currentUserOwnsOrbBadge",
            replacement: {
                match: /(?<=href:(\i).link,)/,
                replace: "onContextMenu:(event)=>{$self.ProfileBadgeContextMenu(event,{userId:arguments[0]?.displayProfile?.userId,badge:$1})},"
            }
        },
        {
            // Pass the guild ID to the profile modal context. Used by the next patch.
            find: "clanTagChiplet}),",
            replacement: {
                match: /("right",)(avatarUrl:null)/,
                replace: "$1guildId:arguments[0]?.channel?.guild_id,$2"
            }
        },
        {
            // Pass the guild ID to the profile modal renderer. Allows guild specific profiles
            // to load on the initial click instead of having to expand the profile first.
            // Needed specifically for member banners.
            find: '["children","userId","user"]',
            replacement: {
                match: /(\),{)(user:\i,currentUser:\i,children)/,
                replace: "$1guildId:arguments[0].guildId,$2"
            }
        },
        {
            // Adds a download button to voice messages before the volume slider.
            find: "volumeSlider,muted",
            replacement: {
                match: /(}\),)(\(0,\i.\i\)\(\i.\i,{className:\i.volumeButton)/,
                replace: "$1$self.VoiceMessageDownloadButton(arguments[0]),$2"
            }
        },
        {
            // Hides the inline download button on text files in
            // favor of the hover download button enabled below.
            find: "formattedSize),children",
            replacement: {
                match: /(\(0,\i.\i\)\(\i.\i,{text:"".concat\(\i.intl.string)/,
                replace: "false&&$1"
            }
        },
        {
            // Passes on the file information to be used by the hover download buttons.
            find: "downloadUrl,showDownload",
            replacement: {
                match: /(?<=downloadUrl,showDownload:\i,)/,
                replace: "item:arguments[0].item,"
            }
        },
        {
            // Forces the hover download button to always be visible on supported media.
            // Also overwrites the onClick function to use the custom download handling.
            find: "downloadHoverButtonIcon,focusProps:{",
            replacement: {
                match: /((\i)=>{)(.{0,60}?)showDownload:(\i),(.{0,1250}?)href:\i,/,
                replace: "$1const downloadifyHoverItem=$2;$3downloadifyShowDownload:$4=!0,$5onClick:()=>{$self.handleHoverDownloadButtonClicked(downloadifyHoverItem);},"
            },
        },
        {
            // Overwrites the default download button behavior for expanded image & video modals.
            // This patch is lazy loaded. You must open an image or video modal for it to resolve.
            find: "SAVE_MEDIA_PRESSED),",
            group: true,
            replacement: [
                {
                    // Make use of the download function.
                    match: /(let{item:\i}=(\i).{0,450}?)(\i\(!0\);try{.{0,400}?finally{\i\(!1\)})/,
                    replace: "$1await $self.handleExpandedModalDownloadButtonClicked($2);",
                },
                {
                    // Prevent videos from opening in browser.
                    match: /(let{item:\i}=\i.{0,350}?)(SAVE_MEDIA_PRESSED\)).{0,100}?type\){/,
                    replace: "$1$2,true){"
                }
            ],
        },
    ],

    start: async () => {
        RestAPI.get({
            url: "/users/@me/collectibles-purchases"
        }).then(result => {
            const listing = result.body;
            if (!CollectiblesData.isNAP(listing)) { return; }
            const item = listing.items[0] as Collectible;
            CollectiblesData.set(item.sku_id, sanitizeCollectible({ ...item, name: listing.name }));
        }).catch();

        RestAPI.get({
            url: "/collectibles-categories/v2"
        }).then(result => {
            result.body.categories?.forEach(category => {
                category?.products?.forEach(listing => {
                    if (!CollectiblesData.isNAP(listing)) { return; }
                    const item = listing.items[0] as Collectible;
                    CollectiblesData.set(item.sku_id, sanitizeCollectible({ ...item, name: listing.name }));
                });
            });
        }).catch();

        RestAPI.get({
            url: "/user-profile-effects"
        }).then(result => {
            result.body.profile_effect_configs?.forEach((effect: ProfileEffect) => {
                CollectiblesData.set(effect.sku_id, sanitizeCollectible({ ...effect, name: effect.title }));
            });
        }).catch();
    }
});
