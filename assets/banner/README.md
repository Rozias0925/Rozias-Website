# Banner photos

This folder contains the nine public research / activity photos used by the homepage banner carousel. Their original filenames are preserved and are referenced directly by the two HTML pages.

For future additions, horizontal **16:9** is the best fit: export at **1920 × 1080 px** when possible (minimum 1600 × 900 px), JPG or WebP, ideally under 1.5 MB each.

The website uses `object-fit: contain` on a black stage. Every photo is shown in full; portrait or non-16:9 images receive black bars rather than being cropped. To add more photos later, add the image to this folder and add one matching `hero-slide` entry to both `index.html` and `index_en.html`.
