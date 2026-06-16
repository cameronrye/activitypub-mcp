# Post an image with alt text

**Goal:** Share an image with a good accessibility description attached.

**Requires:** `ACTIVITYPUB_ENABLE_WRITES=true` + a logged-in account. The image
must be a file **on the machine running the MCP server**.

## Prompt

> "Post the image at **/Users/me/Pictures/sunset.jpg** with a caption about
> tonight's sunset. Write a clear alt-text description of the image for
> accessibility, and set the focal point to the horizon."

## What happens under the hood

1. `upload-media --filePath "/Users/me/Pictures/sunset.jpg" --description "<alt
   text>"` — uploads the file and returns a **media id**. `focusX`/`focusY`
   (-1.0..1.0) set the crop focal point; pass them together.
2. `post-status --content "<caption>" --mediaIds ["<media id>"]` — attaches the
   uploaded media (up to 4 ids) and posts.

## Notes

- `filePath` is an **absolute local path on the MCP server host** — not a URL and
  not the user's machine. The server reads the file directly.
- Alt text matters: the model should describe the image content, not just label
  it. Provide the description in the prompt or let the model draft one for review.
- Mark sensitive media with `sensitive: true` and add a `spoilerText` content
  warning on the post when appropriate.
