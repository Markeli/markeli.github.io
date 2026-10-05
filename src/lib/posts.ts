import { getCollection } from 'astro:content';

// Drafts are visible in `npm run dev` but never make it into the production build.
export async function getPublishedPosts() {
	const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

const WORDS_PER_MINUTE = 200;

// Fenced code is skipped: readers skim it rather than read it word by word.
export function readingTime(body: string | undefined): number {
	const prose = (body ?? '').replace(/^```[\s\S]*?^```/gm, '');
	const words = prose.match(/\S+/g)?.length ?? 0;
	return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export async function getAllTags() {
	const posts = await getPublishedPosts();
	return [...new Set(posts.flatMap((post) => post.data.tags))].sort();
}
