/**
 * The project tree at the top of each lesson's code section: every file a reader has after the lesson, with the files the
 * lesson shows marked "new" or "changed" and linked to their code block. Built from the CodeFile titles of this lesson and of
 * every earlier lesson that builds the same app, so it never drifts from the lessons.
 *
 * Apps: Modules 2-6 build one support app (Module 5 adds the separate shipping MCP server under com/example/shipping). Each
 * Module 1 lesson and each `standalone` lesson is its own small project.
 */
import { CURRICULUM, lessonId } from '@/data/curriculum';

export type FileStatus = 'new' | 'changed' | 'unchanged';

export interface TreeFile {
  path: string;
  status: FileStatus;
  /** The id of the file's code block on this page, when the lesson shows it. */
  anchor?: string;
}

export interface ProjectRoot {
  name: string;
  files: TreeFile[];
}

const sources = import.meta.glob('/src/content/lessons/**/*.mdx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

interface Shown {
  path: string;
  /** The title had a note such as "(additions)": the lesson changes a file the reader already has. */
  noted: boolean;
  /** The app the file belongs to: its Java package root, or for a build or resource file the app of the next Java file. */
  root: string;
  anchor: string;
}

/** The files a lesson shows, in page order, from its CodeFile titles ("src/…/application.yml (additions)" → noted). */
export function shownFiles(id: string): Shown[] {
  const source = sources[`/src/content/lessons/${id}.mdx`] ?? '';
  const titles: { path: string; noted: boolean }[] = [];
  for (const tag of source.split('<CodeFile').slice(1)) {
    const title = /title="([^"]+)"/.exec(tag.slice(0, 400))?.[1];
    const match = title ? /^(\S+)(?:\s+\((.+)\))?$/.exec(title.trim()) : null;
    if (match) titles.push({ path: match[1], noted: match[2] !== undefined });
  }
  const javaRoots = titles.map((t) => PROJECT_ROOT.exec(t.path)?.[1]);
  const seen = new Map<string, number>();
  return titles.map((title, i) => {
    const root = javaRoots[i] ?? javaRoots.slice(i).find(Boolean) ?? javaRoots.slice(0, i).reverse().find(Boolean) ?? 'app';
    const n = (seen.get(title.path) ?? 0) + 1;
    seen.set(title.path, n);
    return { ...title, root, anchor: fileAnchor(title.path, n) };
  });
}

/** Anchor id of the nth code block with this title on a page, shared by CodeFile and the tree. */
export function fileAnchor(title: string, occurrence = 1): string {
  const path = title.trim().split(/\s+\(/)[0];
  const base = 'file-' + path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return occurrence > 1 ? `${base}-${occurrence}` : base;
}

const ANCHORS = Symbol.for('spring-ai-from-scratch.code-file-anchors');
const registry = globalThis as typeof globalThis & { [ANCHORS]?: WeakMap<Request, Map<string, number>> };

/**
 * The anchor of the next CodeFile for this title on the page being rendered: the nth block for the same file gets the nth
 * anchor, as shownFiles() numbers them. Keyed by the page's Request on globalThis, because Astro can load CodeFile as more than
 * one module instance on a page, so module state would count each instance apart.
 */
export function codeFileAnchor(page: Request, title: string): string {
  const pages = (registry[ANCHORS] ??= new WeakMap());
  const counts = pages.get(page) ?? new Map<string, number>();
  pages.set(page, counts);
  const base = fileAnchor(title);
  const occurrence = (counts.get(base) ?? 0) + 1;
  counts.set(base, occurrence);
  return fileAnchor(title, occurrence);
}

const PROJECT_ROOT = /src\/(?:main|test)\/java\/com\/example\/([a-z]+)\//;

/** The files every Spring Boot project of that name has, whether or not a lesson showed them. */
function baseline(root: string, yaml: boolean): string[] {
  const type = root.charAt(0).toUpperCase() + root.slice(1);
  return [
    'settings.gradle',
    'build.gradle',
    `src/main/java/com/example/${root}/${type}${root === 'shipping' ? 'McpApplication' : 'Application'}.java`,
    `src/main/resources/application.${yaml ? 'yaml' : 'yml'}`,
  ];
}

/** The lessons, in course order, whose files make up the same app as this one (this one last). */
function lessonsOfSameApp(id: string): string[] {
  const ordered = CURRICULUM.flatMap((module) =>
    module.lessons.map((lesson) => ({ id: lessonId(module, lesson), standalone: module.number === 1 || lesson.standalone === true })),
  );
  const index = ordered.findIndex((lesson) => lesson.id === id);
  if (index < 0) return [];
  if (ordered[index].standalone) return [id];
  return ordered.slice(0, index + 1).filter((lesson) => !lesson.standalone).map((lesson) => lesson.id);
}

export function projectTree(id: string): ProjectRoot[] {
  const lessons = lessonsOfSameApp(id);
  const current = shownFiles(id);
  const mainRoot = current.map((f) => f.root).find((r) => r !== 'shipping') ?? current[0]?.root ?? 'app';

  const earlier = new Set<string>();
  for (const lesson of lessons.slice(0, -1)) {
    for (const file of shownFiles(lesson)) earlier.add(`${file.root}:${file.path}`);
  }

  const roots = new Map<string, Map<string, TreeFile>>();
  const add = (root: string, file: TreeFile) => {
    if (!roots.has(root)) roots.set(root, new Map());
    const files = roots.get(root)!;
    const existing = files.get(file.path);
    if (!existing || existing.status === 'unchanged') files.set(file.path, file);
  };

  for (const key of earlier) {
    const [root, path] = key.split(/:(.*)/s);
    add(root, { path, status: 'unchanged' });
  }
  for (const file of current) {
    const before = earlier.has(`${file.root}:${file.path}`);
    add(file.root, { path: file.path, status: before || file.noted ? 'changed' : 'new', anchor: file.anchor });
  }
  for (const [root, files] of roots) {
    const yaml = [...files.keys()].some((p) => p.endsWith('.yaml')) || !lessons.some((l) => l.startsWith('01-'));
    for (const path of baseline(root, yaml)) {
      // A project uses one of application.yml / application.yaml; don't invent the other.
      if (path.startsWith('src/main/resources/application.') && [...files.keys()].some((p) => /application\.ya?ml$/.test(p))) continue;
      if (!files.has(path)) files.set(path, { path, status: 'unchanged' });
    }
  }

  return [...roots]
    .sort(([a], [b]) => (a === mainRoot ? -1 : b === mainRoot ? 1 : a.localeCompare(b)))
    .map(([name, files]) => ({ name, files: [...files.values()] }));
}

export interface TreeNode {
  /** File name, directory name, source root ("src/main/java/com/example/support") or collapsed chain ("resources/prompts"). */
  label: string;
  file?: TreeFile;
  children: TreeNode[];
  /** Files below this directory, and how many of them this lesson shows. */
  fileCount: number;
  shownCount: number;
}

const SOURCE_ROOT = /^src\/(?:main|test)\/(?:java\/com\/example\/[a-z]+|resources)(?=\/)/;

/** Turns paths into a tree: directories first, then files, alphabetically; single-child directory chains collapse into one line. */
export function toNodes(files: TreeFile[]): TreeNode[] {
  interface Dir { dirs: Map<string, Dir>; files: TreeFile[] }
  const top: Dir = { dirs: new Map(), files: [] };
  for (const file of files) {
    // A source root (src/main/java/com/example/support, src/test/resources) is one line, so files start two levels in.
    const root = SOURCE_ROOT.exec(file.path)?.[0];
    const parts = root ? [root, ...file.path.slice(root.length + 1).split('/')] : file.path.split('/');
    let dir = top;
    for (const part of parts.slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, { dirs: new Map(), files: [] });
      dir = dir.dirs.get(part)!;
    }
    dir.files.push(file);
  }
  const convert = (dir: Dir): TreeNode[] => {
    const dirs = [...dir.dirs].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => {
      let label = name;
      let node = child;
      while (node.files.length === 0 && node.dirs.size === 1) {
        const [nextName, next] = [...node.dirs][0];
        label += '/' + nextName;
        node = next;
      }
      const children = convert(node);
      const count = (n: TreeNode[]): [number, number] =>
        n.reduce(([f, s], c) => (c.file ? [f + 1, s + (c.file.status === 'unchanged' ? 0 : 1)] : [f + c.fileCount, s + c.shownCount]), [0, 0]);
      const [fileCount, shownCount] = count(children);
      return { label, children, fileCount, shownCount };
    });
    const leaves = [...dir.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({ label: file.path.split('/').pop()!, file, children: [], fileCount: 1, shownCount: file.status === 'unchanged' ? 0 : 1 }));
    return [...dirs, ...leaves];
  };
  return convert(top);
}
