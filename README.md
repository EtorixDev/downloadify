# Downloadify

Download various assets directly in Discord without having to open a browser or dig through HTML.

Available natively in [Equicord](https://github.com/Equicord/Equicord), a Vencord fork, or as a userplugin (you're here!) in [Vencord](https://github.com/Vendicated/Vencord/).

## Features
1. Download non-image files such as ZIP files directly inside of Discord.
    - Allow or disallow unicode characters in file names.
    - Various image assets are available in multiple formats as Discord makes converted copies.
    - APNG and AWEBP are presented with the `.apng` and `.awebp` extensions during download in order to differentiate them from static PNG and WEBP variants, but upon download their extensions are converted back to `.png` and `.webp` respectively.
2. Show a notification when downloads start and finish with a customizable duration.
3. Add a download button to voice messages.
4. Set a default directory or pick each time.
    - Pick whether to overwrite existing files or not.

## TODO
A few things not yet implemented.
1. Game Collection / Profile Widget / Profile Board.
2. Status emojis as part of the `user-context` menu instead of just on their own.
3. Current activity assets, both on their own and as part of the `user-context` menu.
4. Various SVGs, AutoMod icon, profile icons, etc.
5. Improve default file names across handlers.