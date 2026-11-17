import { useEffect, useRef, useState } from 'react';
import { CopyButton, LabFrame, Pill } from './LabFrame';

export interface ProviderVariant {
  id: string;
  name: string;
  note: string;
  env: string[];
  gradle: { lines: string[]; html: string };
  yaml: { lines: string[]; html: string };
}

interface Props {
  variants: ProviderVariant[];
  service: { lines: string[]; html: string };
}

type Tab = 'gradle' | 'yaml' | 'service';

const TAB_FILES: Record<Tab, string> = {
  gradle: 'build.gradle',
  yaml: 'src/main/resources/application.yml',
  service: 'src/main/java/com/example/assistant/AssistantService.java',
};

/** Indexes of lines in `next` that aren't part of the longest common subsequence with `prev`. */
function changedLines(prev: string[], next: string[]): Set<number> {
  const lcs: number[][] = Array.from({ length: prev.length + 1 }, () => new Array(next.length + 1).fill(0));
  for (let i = prev.length - 1; i >= 0; i--) {
    for (let j = next.length - 1; j >= 0; j--) {
      lcs[i][j] = prev[i] === next[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const changed = new Set<number>();
  let i = 0;
  let j = 0;
  while (j < next.length) {
    if (i < prev.length && prev[i] === next[j]) {
      i++;
      j++;
    } else if (i < prev.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      changed.add(j++);
    }
  }
  return changed;
}

export default function ProviderSwitcher({ variants, service }: Props) {
  const [currentId, setCurrentId] = useState(variants[0].id);
  const [previousId, setPreviousId] = useState(variants[0].id);
  const [tab, setTab] = useState<Tab>('yaml');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);

  const current = variants.find((v) => v.id === currentId)!;
  const previous = variants.find((v) => v.id === previousId)!;
  const diffs: Record<Tab, Set<number>> = {
    gradle: changedLines(previous.gradle.lines, current.gradle.lines),
    yaml: changedLines(previous.yaml.lines, current.yaml.lines),
    service: new Set(),
  };
  const file = tab === 'service' ? service : current[tab];

  useEffect(() => {
    codeRef.current?.querySelectorAll('.line').forEach((line, index) => {
      line.classList.toggle('diff-changed', diffs[tab].has(index));
    });
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(file.lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context or denied): the code stays selectable by hand.
    }
  }

  function select(id: string) {
    if (id === currentId) return;
    setPreviousId(currentId);
    setCurrentId(id);
  }

  return (
    <LabFrame
      title="Provider & Gradle config switcher"
      hint="Switch providers and watch which lines change in build.gradle and application.yml. The Java service never changes."
    >
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <Pill key={v.id} active={v.id === currentId} onClick={() => select(v.id)}>
            {v.name}
          </Pill>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {(Object.keys(TAB_FILES) as Tab[]).map((t) => {
          const count = diffs[t].size;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={
                'rounded-lg border px-2 py-2 transition-colors ' +
                (tab === t
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                  : 'border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500')
              }
            >
              <span className="block truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                {TAB_FILES[t].split('/').pop()}
              </span>
              <span
                className={
                  'mt-0.5 block text-[0.68rem] ' +
                  (t === 'service'
                    ? 'font-semibold text-brand-700 dark:text-brand-300'
                    : count > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-500')
                }
              >
                {t === 'service' ? '✓ unchanged' : previousId === currentId ? '—' : `${count} line${count === 1 ? '' : 's'} changed`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="code-mono min-w-0 truncate text-[0.8rem] font-medium text-slate-700 dark:text-slate-300">{TAB_FILES[tab]}</span>
          <CopyButton label={`Copy ${TAB_FILES[tab]}`} done={copied} onClick={copy} />
        </div>
        <div
          ref={codeRef}
          className="[&_pre]:max-h-[26rem] [&_pre]:overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: file.html }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{current.name}: </span>
          {current.note}
        </p>
        <p className="font-mono">
          {current.env.length > 0 ? current.env.map((e) => `export ${e}=…`).join('  ') : 'No API key needed'}
        </p>
      </div>
    </LabFrame>
  );
}
