/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { OptionType } from "@utils/types";
import { Button, showToast, Toasts, useEffect, useState } from "@webpack/common";
import { JSX } from "react";

import { getFormattedNow } from "./utils/misc";
import { d, DownloadifyLogger, DownloadifyNative } from "./utils/nonative";

function DefaultDirectorySetting(): JSX.Element {
    const [defaultDirectory, setDefaultDirectory] = useState<string | null>(null);
    const [isDialogueOpen, setDialogueOpen] = useState(false);

    useEffect(() => {
        const loadDefaultDirectory = async () => {
            const dir = await DownloadifyNative.getDownloadDirectory();
            setDefaultDirectory(dir);
        };

        loadDefaultDirectory();
    }, []);

    const handlePickDirectory = async () => {
        try {
            setDialogueOpen(true);
            await DownloadifyNative.setDownloadDirectory();
            const newDir = await DownloadifyNative.getDownloadDirectory();
            setDefaultDirectory(newDir);
        } catch (error) {
            DownloadifyLogger.error(`[${getFormattedNow()}] [FAILED TO SET DOWNLOAD DIRECTORY]`, error);
            showToast("Failed to set download directory.", Toasts.Type.FAILURE, { duration: 3000 });
        } finally {
            setDialogueOpen(false);
        }
    };

    const handleClearDirectory = async () => {
        DownloadifyNative.clearDownloadDirectory();
        setDefaultDirectory(null);
    };

    return (
        <ErrorBoundary>
            <section>
                <Heading className={d("form-title")}>
                    Default Directory
                </Heading>
                <Paragraph className={d("form-description")}>
                    Default download location. If set, the file will always be downloaded in its original format even if alternatives are available. Leave empty to pick a folder and file type each time.
                </Paragraph>
                <div className={d("directory-container")}>
                    <Paragraph className={d("directory-display")}>
                        {defaultDirectory || "No Directory Set"}
                    </Paragraph>
                    <div className={d("directory-buttons")}>
                        <Button
                            disabled={isDialogueOpen}
                            className={d("directory-button", "browse-button", { "disabled": isDialogueOpen })}
                            onClick={handlePickDirectory}
                            color={Button.Colors.CUSTOM}
                        >
                            {isDialogueOpen ? "Browsing..." : "Browse"}
                        </Button>
                        <Button
                            disabled={!defaultDirectory || isDialogueOpen}
                            className={d("directory-button", "clear-button", { "disabled": !defaultDirectory || isDialogueOpen })}
                            onClick={handleClearDirectory}
                            color={Button.Colors.CUSTOM}
                        >
                            Clear
                        </Button>
                    </div>
                </div>
            </section>
        </ErrorBoundary>
    );
}

export const settings = definePluginSettings({
    displayStatus: {
        description: "Display a status notification when downloads start, finish, or error.",
        type: OptionType.BOOLEAN,
        default: true,
    },
    statusDuration: {
        type: OptionType.SLIDER,
        description: "The number of seconds to display status notifications.",
        markers: [1, 3, 5],
        default: 2.5,
        stickToMarkers: false,
    },
    voiceMessages: {
        description: "Add a download button to voice messages.",
        type: OptionType.BOOLEAN,
        default: true,
    },
    allowUnicode: {
        description: "Allow non-ASCII characters in file names.",
        type: OptionType.BOOLEAN,
        default: true,
    },
    overwriteFiles: {
        description: "If a default directory is set and a download file name matches an existing file, overwrite the file. If disabled, a number will be appended to the file name.",
        type: OptionType.BOOLEAN,
        default: false,
    },
    defaultDirectory: {
        component: DefaultDirectorySetting,
        type: OptionType.COMPONENT,
        default: "",
    },
});
