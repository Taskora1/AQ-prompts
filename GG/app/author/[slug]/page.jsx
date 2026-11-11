import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import Breadcrumb from '@/components/Breadcrumb';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import JsonLd from '@/components/JsonLd';
import { getAuthorProfileBySlug, getPublishedBlogPostsByAuthor, listAuthorSitemapRows } from '@/lib/author-profiles-db';
import { buildMetadata } from '@/lib/metadata';
import { absoluteUrl, buildBreadcrumbSchema, buildWebsiteSchema } from '@/lib/seo';

export const revalidate = 86400; // 24h — author profiles/posts change rarely; on-demand revalidation via revalidateBlogContent

export async function generateStaticParams() {
  const rows = await listAuthorSitemapRows();
  return rows.filter((row) => row?.slug).map((row) => ({ slug: row.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const author = await getAuthorProfileBySlug(slug);
  if (!author) return { robots: { index: false, follow: false } };

  return buildMetadata({
    title: `${author.name}${author.roleTitle ? ` – ${author.roleTitle}` : ' – Author'}`,
    description: author.bio,
    path: author.url,
    image: author.avatarUrl || undefined,
    authors: [author.name],
  });
}

export default async function AuthorProfilePage({ params }) {
  const { slug } = await params;
  const author = await getAuthorProfileBySlug(slug);
  if (!author) notFound();

  const posts = await getPublishedBlogPostsByAuthor(author);
  const profileUrl = absoluteUrl(author.url);
  const personId = `${profileUrl}#person`;
  const schema = [
    buildWebsiteSchema(),
    buildBreadcrumbSchema([
      { name: 'Home', item: '/' },
      { name: 'Authors', item: author.url },
      { name: author.name, item: author.url },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: `${author.name} author profile`,
      url: profileUrl,
      mainEntity: {
        '@type': 'Person',
        '@id': personId,
        name: author.name,
        url: profileUrl,
        ...(author.roleTitle ? { jobTitle: author.roleTitle } : {}),
        ...(author.avatarUrl ? { image: absoluteUrl(author.avatarUrl) } : {}),
        description: author.bio,
        sameAs: author.socialLinks.map((link) => link.href),
      },
    },
  ];

  return (
    <>
      <Header />
      <JsonLd data={schema} />
      <main id="main-content" className="container mx-auto min-h-[60vh] max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Authors', href: '/blog' }, { label: author.name }]} />
        <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {author.avatarUrl ? (
              <Image
                src={author.avatarUrl}
                alt={author.name}
                width={128}
                height={128}
                className="h-28 w-28 rounded-full object-cover"
                unoptimized={!author.avatarUrl.startsWith('/')}
              />
            ) : null}
            <div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">{author.name}</h1>
              {author.roleTitle ? <p className="mt-2 text-lg text-[var(--text-secondary)]">{author.roleTitle}</p> : null}
            </div>
          </div>
          <p className="mt-6 whitespace-pre-line text-base leading-7 text-[var(--text-secondary)]">{author.bio}</p>
          {author.socialLinks.length ? (
            <nav aria-label={`${author.name} social profiles`} className="mt-5 flex flex-wrap gap-4">
              {author.socialLinks.map((link) => (
                <a key={`${link.name}-${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--accent)] hover:underline">
                  {link.name}
                </a>
              ))}
            </nav>
          ) : null}
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Articles by {author.name}</h2>
          {posts.length ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {posts.map((post) => (
                <li key={post.slug} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-lg font-semibold">
                    <Link href={`/blog/${post.slug}`} className="hover:underline">{post.title}</Link>
                  </h3>
                  {post.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{post.excerpt}</p> : null}
                  {post.publishDate ? <time className="mt-3 block text-xs text-[var(--text-secondary)]" dateTime={post.publishDate}>{post.publishDate}</time> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No published articles yet.</p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
