import { getCollection } from 'astro:content';

// Drafts are visible in `npm run dev` but never make it into the production build.
export async function getPublishedPosts() {
	const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getAllTags() {
	const posts = await getPublishedPosts();
	return [...new Set(posts.flatMap((post) => post.data.tags))].sort();
}
