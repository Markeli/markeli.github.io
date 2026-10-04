# markeli.github.io

Personal blog built with [Astro](https://astro.build), deployed to GitHub Pages on every push to `main`.

## Writing a post

1. Create `src/content/blog/<slug>/index.md` (or `.mdx` if you need components). The folder name becomes the URL:
   `/blog/<slug>/`.
2. Add frontmatter:

   ```yaml
   ---
   title: My post
   description: One-line summary used in lists, RSS and link previews.
   pubDate: 2026-10-04
   tags: [dotnet, security]
   draft: true          # visible in `npm run dev`, excluded from the build
   # updatedDate: 2026-10-10
   # heroImage: ./cover.png
   ---
   ```

3. Put images next to `index.md` and reference them relatively: `![alt](./diagram.png)`.
4. Open a PR to preview the build in CI, remove `draft: true`, merge.

## Commands

| Command           | Action                                  |
| :---------------- | :-------------------------------------- |
| `npm install`     | Install dependencies                    |
| `npm run dev`     | Dev server at `localhost:4321` (drafts shown) |
| `npm run build`   | Production build to `./dist/` + Pagefind search index |
| `npm run preview` | Serve the production build locally (search works only here) |

## Search

[Pagefind](https://pagefind.app) indexes the built HTML after `astro build` (only post bodies, marked with
`data-pagefind-body`). Open it with the search button or `⌘K` / `Ctrl+K`. The index doesn't exist in `npm run dev`.

## Comments

Comments use [giscus](https://giscus.app) backed by this repo's Discussions (category `Announcements`, so only
giscus and the owner can open threads). The [giscus app](https://github.com/apps/giscus) must be installed on the repo.
Settings live in `GISCUS` in `src/consts.ts`.
`giscus.json` restricts which sites may embed the comments — add any new domain there.
