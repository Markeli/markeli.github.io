---
title: Hello, world
description: Why I started this blog, what I'm going to write about, and how it's built.
pubDate: 2026-10-04
tags: [meta, astro]
---

Hi, I'm Max. I run security and the .NET platform at [Mindbox](https://mindbox.cloud), and before that I spent
about a decade writing .NET code, going from intern to team lead.

Over the years I've collected a lot of notes, internal docs and long chat threads that explain _why_ something was
done the way it was. Most of them are locked inside company wikis or my head. This blog is where I'll write the
reusable parts down in public.

## What to expect

- **Engineering management**: growing teams, platform work, and the boring processes that make delivery predictable.
- **Security as engineering**: controls, detection and access treated as code rather than as checklists.
- **.NET**: libraries I maintain under [Curiosus Dev](https://github.com/curiosus-dev) and the problems I keep
  running into in production.

## How it's built

This is a plain developer setup: posts are Markdown files in a [GitHub repo](https://github.com/Markeli/markeli.github.io),
[Astro](https://astro.build) builds a static site, and GitHub Actions deploys it to GitHub Pages on every merge to
`main`. Search is [Pagefind](https://pagefind.app), comments are [giscus](https://giscus.app) on top of GitHub
Discussions, and there's an [RSS feed](/rss.xml) if you prefer readers.

If you spot a mistake or want to argue with something, the comments below are open. You just need a GitHub account.
