import { getCollection } from 'astro:content';
import { CURRICULUM, lessonId, type Lesson, type Module } from '@/data/curriculum';

export interface NavLesson extends Lesson {
  id: string;
  href: string | null;
}

export interface NavModule extends Module {
  navLessons: NavLesson[];
}

export function withBase(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function lessonHref(id: string): string {
  return withBase(`modules/${id}/`);
}

/** The curriculum with each lesson's href, or null when its MDX file doesn't exist yet. */
export async function getNavigation(): Promise<NavModule[]> {
  const published = new Set((await getCollection('lessons')).map((entry) => entry.id));
  return CURRICULUM.map((module) => ({
    ...module,
    navLessons: module.lessons.map((lesson) => {
      const id = lessonId(module, lesson);
      return { ...lesson, id, href: published.has(id) ? lessonHref(id) : null };
    }),
  }));
}

/** Published lessons in course order, for previous/next links. */
export function publishedSequence(nav: NavModule[]): NavLesson[] {
  return nav.flatMap((module) => module.navLessons.filter((lesson) => lesson.href !== null));
}
