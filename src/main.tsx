import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { linter } from '@codemirror/lint';
import { EditorView, highlightActiveLine } from '@codemirror/view';
import './style.css';

const LazyPdfViewer = lazy(() => import('./PdfViewer'));

const STORAGE_KEY = 'tailor-tex-workspace-v1';
type Skill = { name: string; aliases: string[]; group: string };
type SkillGroup = { id: string; title: string; icon: string; skills: [string, string[]][] };
type SavedState = { code: string; required: string[]; overrides: Record<string, boolean>; customSkills?: Skill[]; fileName?: string; engine?: CompileEngine };
type Diagnostic = { line: number; message: string; severity: 'error' | 'warning' | 'info' };
type CompileStatus = 'idle' | 'loading' | 'compiling' | 'success' | 'error';
type CompileEngine = 'pdflatex' | 'xelatex' | 'auto';
const STARTER = `\\documentclass[letterpaper,10pt]{article}
\\usepackage[margin=0.7in]{geometry}
\\begin{document}

% Paste or write your resume here.

\\end{document}`;

const GROUPS: SkillGroup[] = [
  { id: 'frontend', title: 'Frontend', icon: '◧', skills: [
    ['React', ['React.js']], ['TypeScript', ['TS']], ['JavaScript', ['JS', 'ECMAScript']], ['Next.js', ['NextJS']], ['Vue.js', ['Vue']], ['Angular', []], ['HTML', ['HTML5']], ['CSS', ['CSS3']], ['Tailwind CSS', ['Tailwind']], ['Sass', ['SCSS']], ['Accessibility', ['a11y', 'Web accessibility']], ['Redux', ['Redux Toolkit']],
  ] },
  { id: 'backend', title: 'Backend', icon: '⌘', skills: [
    ['Node.js', ['NodeJS', 'Node']], ['Express.js', ['Express']], ['Python', []], ['Java', []], ['C#', ['C Sharp']], ['Go', ['Golang']], ['REST APIs', ['RESTful API', 'REST API']], ['GraphQL', []], ['Spring Boot', ['Spring']], ['Django', []], ['FastAPI', []], ['Microservices', ['Microservice architecture']],
  ] },
  { id: 'data', title: 'Data & Storage', icon: '▤', skills: [
    ['PostgreSQL', ['Postgres']], ['MySQL', []], ['MongoDB', ['Mongo']], ['Redis', []], ['SQLite', []], ['SQL', ['Structured Query Language']], ['Prisma', []], ['Elasticsearch', ['ElasticSearch']],
  ] },
  { id: 'cloud', title: 'Cloud & DevOps', icon: '☁', skills: [
    ['AWS', ['Amazon Web Services']], ['Azure', ['Microsoft Azure']], ['Google Cloud', ['GCP', 'Google Cloud Platform']], ['Docker', []], ['Kubernetes', ['K8s']], ['CI/CD', ['Continuous integration', 'Continuous delivery']], ['Git', []], ['Linux', []], ['Terraform', []], ['Vercel', []],
  ] },
  { id: 'testing', title: 'Testing & Tools', icon: '⌁', skills: [
    ['Jest', []], ['Cypress', []], ['Playwright', []], ['Pytest', ['pytest']], ['JUnit', []], ['GitHub Actions', []], ['Figma', []], ['Agile', ['Scrum']], ['Unit Testing', ['Unit tests']], ['Selenium', []],
  ] },
];
const ALL_SKILLS = GROUPS.flatMap((group) => group.skills.map(([name, aliases]) => ({ name, aliases, group: group.id })));
const EXTRA_TECHNOLOGIES: [string, string, string[]][] = [
  ['Rust', 'backend', []], ['Ruby', 'backend', []], ['PHP', 'backend', []], ['Kotlin', 'backend', []], ['Swift', 'backend', []], ['Scala', 'backend', []], ['Dart', 'backend', []], ['C++', 'backend', []], ['.NET', 'backend', ['dotnet']],
  ['Svelte', 'frontend', []], ['Nuxt', 'frontend', ['Nuxt.js']], ['Remix', 'frontend', ['Remix.run']], ['Astro', 'frontend', []], ['Vite', 'frontend', []], ['Webpack', 'frontend', []], ['NestJS', 'backend', ['Nest.js']], ['Flask', 'backend', []], ['Laravel', 'backend', []], ['Ruby on Rails', 'backend', ['Rails']], ['ASP.NET', 'backend', []], ['Hibernate', 'backend', []],
  ['Kafka', 'data', ['Apache Kafka']], ['RabbitMQ', 'backend', []], ['DynamoDB', 'data', ['Amazon DynamoDB']], ['Cassandra', 'data', ['Apache Cassandra']], ['Snowflake', 'data', []], ['BigQuery', 'data', ['Google BigQuery']], ['Oracle', 'data', ['Oracle Database']], ['MariaDB', 'data', []], ['Firebase', 'data', []], ['Supabase', 'data', []], ['Apache Spark', 'data', ['Spark']], ['Hadoop', 'data', ['Apache Hadoop']], ['Airflow', 'data', ['Apache Airflow']], ['dbt', 'data', []], ['Databricks', 'data', []],
  ['Jenkins', 'cloud', []], ['CircleCI', 'cloud', []], ['Prometheus', 'cloud', []], ['Grafana', 'cloud', []], ['Helm', 'cloud', []], ['Ansible', 'cloud', []], ['Pulumi', 'cloud', []], ['Bash', 'cloud', ['Shell scripting']], ['PowerShell', 'cloud', []], ['Nginx', 'cloud', ['NGINX']],
  ['gRPC', 'backend', []], ['OAuth', 'backend', ['OAuth 2.0']], ['JWT', 'backend', ['JSON Web Token']], ['WebSockets', 'backend', ['WebSocket']], ['Vitest', 'testing', []], ['Mocha', 'testing', []], ['RSpec', 'testing', []], ['Postman', 'testing', []], ['OpenAPI', 'backend', ['Swagger']],
  ['SwiftUI', 'frontend', []], ['Flutter', 'frontend', []], ['React Native', 'frontend', []], ['Unity', 'backend', []], ['Unreal Engine', 'backend', ['Unreal']],
];
const START = '% tailor.tex:skills:start';
const END = '% tailor.tex:skills:end';
const latexLanguage = StreamLanguage.define(stex);
const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', backgroundColor: '#fff' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'DM Mono, Consolas, monospace', lineHeight: '1.75' },
  '.cm-gutters': { backgroundColor: '#fbfcfa', borderRight: '1px solid #eef0ec', color: '#b8c1b9' },
  '.cm-activeLine': { backgroundColor: '#f8faf7' },
  '.cm-activeLineGutter': { backgroundColor: '#f3f7f3' },
  '.cm-content': { padding: '16px 0' },
  '.cm-line': { padding: '0 16px' },
});

function normalize(value: string) {
  return value
    .replace(/(^|[^\\])%.*$/gm, '$1 ')
    .replace(/\\([{}%&#_$])/g, '$1')
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectResumeEngine(source: string): 'pdflatex' | 'xelatex' {
  const uncommented = source.replace(/(^|[^\\])%.*$/gm, '$1 ');
  const needsXeLaTeX = /\\usepackage(?:\s*\[[^\]]*\])?\s*\{[^}]*\b(?:fontspec|unicode-math)\b[^}]*\}/i.test(uncommented)
    || /\\(?:setmainfont|setsansfont|setmonofont|setmathfont|newfontface|newfontfamily|fontspec)\b/i.test(uncommented);
  return needsXeLaTeX ? 'xelatex' : 'pdflatex';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSkillInText(text: string, skill: Skill) {
  const normalizedText = normalize(text);
  return [skill.name, ...skill.aliases].some((term) => {
    const normalizedTerm = normalize(term);
    const termText = normalizedTerm === 'js' ? normalizedText.replace(/\b(?:node|react|next|vue|express|nest|nuxt)\.js\b/g, ' ') : normalizedText;
    return normalizedTerm && new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?=$|[^a-z0-9])`).test(termText);
  });
}

function findSkillInPlainText(text: string, skill: Skill) {
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
  return [skill.name, ...skill.aliases].some((term) => {
    const normalizedTerm = term.toLowerCase().trim();
    const termText = normalizedTerm === 'js' ? normalizedText.replace(/\b(?:node|react|next|vue|express|nest|nuxt)\.js\b/g, ' ') : normalizedText;
    return normalizedTerm && new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?=$|[^a-z0-9])`, 'i').test(termText);
  });
}

function extractUnlistedTechnologies(text: string, catalog: Skill[]): Skill[] {
  return EXTRA_TECHNOLOGIES
    .filter(([name, , aliases]) => !catalog.some((skill) => skill.name.toLowerCase() === name.toLowerCase())
      && findSkillInPlainText(text, { name, aliases, group: 'custom' }))
    .map(([name, group, aliases]) => ({ name, group, aliases }));
}

function inferSkillGroup(name: string) {
  const value = name.toLowerCase();
  if (/react|vue|angular|svelte|frontend|front.end|css|html|ui|web|tailwind|flutter|swiftui/i.test(value)) return 'frontend';
  if (/sql|database|data|redis|mongo|postgres|kafka|spark|warehouse|storage/i.test(value)) return 'data';
  if (/aws|azure|cloud|docker|kubernetes|devops|linux|terraform|jenkins|grafana|ansible/i.test(value)) return 'cloud';
  if (/test|jest|cypress|playwright|pytest|selenium|postman/i.test(value)) return 'testing';
  return 'backend';
}

function getSkillsSectionRange(code: string): { start: number; end: number } | null {
  const heading = /\\section\*?\s*\{[^}]*\bskills\b[^}]*\}/ig;
  const match = heading.exec(code);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = code.slice(start);
  const next = /\\section\*?\s*\{/i.exec(rest);
  const end = next ? start + next.index : (code.indexOf('\\end{document}', start) >= 0 ? code.indexOf('\\end{document}', start) : code.length);
  return { start, end };
}

function scanSkills(code: string, catalog: Skill[] = ALL_SKILLS): Set<string> {
  const range = getSkillsSectionRange(code);
  const scanText = range ? code.slice(range.start, range.end) : code;
  return new Set(catalog.filter((skill) => findSkillInText(scanText, skill)).map((skill) => skill.name));
}

function skillSectionFor(skillName: string, catalog: Skill[] = ALL_SKILLS) {
  if (['Java', 'JavaScript', 'TypeScript', 'Python', 'C#', 'Go'].includes(skillName)) return 'language';
  if (skillName === 'SQL') return 'data';
  return catalog.find((skill) => skill.name === skillName)?.group || 'tools';
}

function headingMatchesSkill(heading: string, skillName: string, catalog: Skill[] = ALL_SKILLS) {
  const value = normalize(heading);
  const target = skillSectionFor(skillName, catalog);
  const aliases: Record<string, string[]> = {
    language: ['programming language', 'languages', 'language'],
    frontend: ['frontend', 'front end', 'ui', 'web development'],
    backend: ['backend', 'back end', 'server side'],
    data: ['database', 'data', 'storage'],
    cloud: ['devops', 'developer tools', 'cloud', 'infrastructure', 'tools'],
    testing: ['testing', 'test', 'qa', 'quality assurance'],
    tools: ['tools', 'technical skills', 'skills'],
    custom: ['additional skills', 'other skills', 'tools', 'technical skills'],
  };
  const matches = (terms: string[]) => terms.some((term) => value.includes(term));
  if (target === 'data' && matches(aliases.data)) return true;
  if (target === 'language' && matches(aliases.language)) return true;
  if (target === 'frontend' && matches(aliases.frontend)) return true;
  if (target === 'backend' && matches(aliases.backend)) return true;
  if (target === 'cloud' && matches(aliases.cloud)) return true;
  if (target === 'testing' && matches(aliases.testing)) return true;
  return target === 'custom' ? matches(aliases.custom) : target === 'tools' && matches(aliases.tools);
}

function defaultSkillHeading(skillName: string, catalog: Skill[] = ALL_SKILLS) {
  const headings: Record<string, string> = {
    language: 'Programming Languages', frontend: 'Frontend Development', backend: 'Backend Development',
    data: 'Databases and Data', cloud: 'Developer Tools and DevOps', testing: 'Testing and Tools', tools: 'Technical Skills', custom: 'Additional Skills',
  };
  return headings[skillSectionFor(skillName, catalog)] || 'Additional Skills';
}

function appendSkillValue(value: string, skill: Skill) {
  if (findSkillInText(value, skill)) return value;
  const suffix = value.match(/\s*(\\\\(?:\[[^\]]*\])?\s*)$/)?.[1] || '';
  const body = suffix ? value.slice(0, -suffix.length).trimEnd() : value.trimEnd();
  return `${body}${body.trim() ? ', ' : ''}${skill.name}${suffix || ' \\\\'}`;
}

function addSkillToCode(code: string, skillName: string, catalog: Skill[] = ALL_SKILLS) {
  const section = getSkillsSectionRange(code);
  if (!section) {
    const endDocument = code.lastIndexOf('\\end{document}');
    const newSection = `\\section*{Skills}\n\\textbf{${defaultSkillHeading(skillName, catalog)}:} ${skillName} \\\\`;
    if (endDocument >= 0) return `${code.slice(0, endDocument).trimEnd()}\n\n${newSection}\n\n${code.slice(endDocument)}`;
    return `${code.trimEnd()}\n\n${newSection}\n`;
  }

  let body = code.slice(section.start, section.end);
  // Migrate any older app-managed block into the actual resume headings.
  const legacy = body.match(new RegExp(`${escapeRegExp(START)}([\\s\\S]*?)${escapeRegExp(END)}`));
  const names = new Set<string>([skillName]);
  if (legacy) {
    for (const item of catalog) if (findSkillInText(legacy[1], item)) names.add(item.name);
    body = body.replace(legacy[0], '');
  }

  for (const name of names) {
    const item = catalog.find((skill) => skill.name === name);
    if (!item) continue;
    const lines = body.split('\n');
    let rowIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i].match(/^(\s*\\textbf\{)([^}]+)(\}\s*)(.*)$/i);
      if (row && headingMatchesSkill(row[2].replace(/:\s*$/, ''), name, catalog)) { rowIndex = i; break; }
    }
    if (rowIndex >= 0) {
      const row = lines[rowIndex].match(/^(\s*\\textbf\{[^}]+\}\s*)(.*)$/i)!;
      lines[rowIndex] = row[1] + appendSkillValue(row[2], item);
      body = lines.join('\n');
      continue;
    }

    // Also recognize explicit LaTeX subsections and place list entries inside them.
    const subsectionIndex = lines.findIndex((line) => {
      const heading = line.match(/\\subsection\*?\s*\{([^}]+)\}/i);
      return heading && headingMatchesSkill(heading[1], name, catalog);
    });
    if (subsectionIndex >= 0) {
      let end = lines.findIndex((line, index) => index > subsectionIndex && /\\(?:subsection|section)\*?\s*\{/.test(line));
      if (end < 0) end = lines.length;
      const itemizeEnd = lines.findIndex((line, index) => index > subsectionIndex && index < end && /\\end\s*\{itemize\}/.test(line));
      if (itemizeEnd >= 0) lines.splice(itemizeEnd, 0, `  \\item ${name}`);
      else lines.splice(subsectionIndex + 1, 0, `\\textbf{${name}}`);
      body = lines.join('\n');
      continue;
    }

    const heading = defaultSkillHeading(name, catalog);
    const newRow = `\\textbf{${heading}:} ${name} \\\\`;
    const insertAt = body.search(/\n\s*\n/);
    if (insertAt >= 0) body = `${body.slice(0, insertAt)}\n${newRow}${body.slice(insertAt)}`;
    else body = `${body.trimEnd()}\n${newRow}\n`;
  }
  return `${code.slice(0, section.start)}${body}${code.slice(section.end)}`;
}

function removeSkillFromCode(code: string, skillName: string, catalog: Skill[] = ALL_SKILLS) {
  const skill = catalog.find((item) => item.name === skillName);
  if (!skill) return code;
  const range = getSkillsSectionRange(code);
  if (!range) return code;
  const original = code.slice(range.start, range.end);
  // Remove from the existing comma/semicolon separated row while preserving its LaTeX heading and row break.
  const variants = [skill.name, ...skill.aliases].sort((a, b) => b.length - a.length);
  const changed = original.split('\n').map((line) => {
    if (/^\s*\\item\s+/i.test(line) && findSkillInText(line, skill)) return '';
    const row = line.match(/^(\s*\\textbf\{[^}]+\}\s*)(.*)$/i);
    if (!row) {
      if (/^\s*\\textbf\{[^}]+\}\s*$/.test(line) && findSkillInText(line, skill)) return '';
      return line;
    }
    let value = row[2];
    for (const variant of variants) {
      const token = new RegExp(`(^|[,;]\\s*)${escapeRegExp(variant)}(?=\\s*([,;]|$|\\\\))`, 'ig');
      value = value.replace(token, (_whole, prefix: string) => prefix && prefix.trim() ? prefix : '');
    }
    value = value.replace(/,\s*,/g, ',').replace(/;\s*;/g, ';').replace(/[,;]\s*(?=\\\\|$)/g, '').replace(/^\s*[,;]\s*|[,;]\s*$/g, '');
    return row[1] + value;
  }).join('\n');
  return `${code.slice(0, range.start)}${changed}${code.slice(range.end)}`;
}

function readSavedState(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved.code === 'string') return saved;
  } catch { /* Start with a clean local workspace if saved data is unreadable. */ }
  return { code: STARTER, required: [], overrides: {}, fileName: 'resume.tex', engine: 'pdflatex' };
}

function parseDiagnostics(log: string, fileName: string): Diagnostic[] {
  const result: Diagnostic[] = [];
  const text = log.replaceAll('\\r', '');
  const fileBase = fileName.split(/[\\/]/).pop() || 'resume.tex';
  const escapedFile = escapeRegExp(fileBase);
  const linePatterns = [
    new RegExp(`(?:^|\\n)(?:.*[\\/])?${escapedFile}:(\\d+):\\s*(.*)`, 'gi'),
    /(?:^|\n)l\.(\d+)\s*(.*)/gi,
  ];
  for (const pattern of linePatterns) {
    for (const match of text.matchAll(pattern)) {
      const message = (match[2] || 'LaTeX reported a problem').trim();
      if (!result.some((item) => item.line === Number(match[1]) && item.message === message)) {
        result.push({ line: Number(match[1]), message, severity: /warning/i.test(message) ? 'warning' : 'error' });
      }
    }
  }
  if (!result.length && text.trim()) {
    result.push({ line: 0, message: text.trim().split('\n').slice(-4).join('\n'), severity: 'error' });
  }
  return result;
}

function App() {
  const [initial] = useState(readSavedState);
  const [code, setCode] = useState(initial.code);
  const [required, setRequired] = useState<Set<string>>(new Set(initial.required || []));
  const [overrides, setOverrides] = useState(initial.overrides || {});
  const [customSkills, setCustomSkills] = useState<Skill[]>(initial.customSkills || []);
  const [fileName, setFileName] = useState(initial.fileName || 'resume.tex');
  const [compileEngine, setCompileEngine] = useState<CompileEngine>(initial.engine || 'pdflatex');
  const [query, setQuery] = useState('');
  const [jdText, setJdText] = useState('');
  const [jdFeedback, setJdFeedback] = useState('');
  const [customSkillName, setCustomSkillName] = useState('');
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoCompile, setAutoCompile] = useState(true);
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle');
  const [compileLog, setCompileLog] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [compiledSource, setCompiledSource] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const compilerRef = useRef<import('@siglum/engine').SiglumCompiler | null>(null);
  const queuedSourceRef = useRef<string | null>(null);
  const isCompilingRef = useRef(false);
  const skillCatalog = useMemo(() => [...ALL_SKILLS, ...customSkills], [customSkills]);
  const detected = useMemo(() => scanSkills(code, skillCatalog), [code, skillCatalog]);
  const inResume = (name: string): boolean => Object.hasOwn(overrides, name) ? overrides[name] : detected.has(name);
  const activeCount = skillCatalog.filter((skill) => inResume(skill.name)).length;
  const requiredCount = required.size;
  const jdSkills = useMemo(() => skillCatalog.filter((skill) => jdText && findSkillInPlainText(jdText, skill)), [jdText, skillCatalog]);
  const newJdSkills = useMemo(() => jdText ? extractUnlistedTechnologies(jdText, skillCatalog) : [], [jdText, skillCatalog]);
  const applicableJdSkills = useMemo(() => [...jdSkills, ...newJdSkills], [jdSkills, newJdSkills]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, required: [...required], overrides, customSkills, fileName, engine: compileEngine }));
  }, [code, required, overrides, customSkills, fileName, compileEngine]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const compileSource = useCallback(async (source: string) => {
    queuedSourceRef.current = source;
    if (isCompilingRef.current) return;
    isCompilingRef.current = true;
    while (queuedSourceRef.current !== null) {
      const currentSource = queuedSourceRef.current;
      queuedSourceRef.current = null;
      try {
        if (!compilerRef.current) {
          setCompileStatus('loading');
          setCompileLog('Loading the browser-based LaTeX engine for the first compile…');
          const [{ SiglumCompiler, resolveRuntime }, { default: workerUrl }] = await Promise.all([
            import('@siglum/engine'),
            import('@siglum/engine/worker?url'),
          ]);
          const runtime = await resolveRuntime();
          compilerRef.current = new SiglumCompiler({ ...runtime, workerUrl });
          await compilerRef.current.init();
        }
        setCompileStatus('compiling');
        const activeEngine = compileEngine === 'auto' ? detectResumeEngine(currentSource) : compileEngine;
        setCompileLog(compileEngine === 'auto'
          ? `Auto selected ${activeEngine === 'pdflatex' ? 'pdfLaTeX' : 'XeLaTeX'}. Compiling LaTeX…`
          : 'Compiling LaTeX…');
        let result = await compilerRef.current.compile(currentSource, { mainFile: fileName, engine: activeEngine });
        if (queuedSourceRef.current !== null) continue;
        let log = [result.error, result.log].filter(Boolean).join('\n');
        let fallbackNotice = '';
        if (!result.success && activeEngine === 'xelatex'
          && /can't find[^\n]*xelatex\.fmt/i.test(log)
          && detectResumeEngine(currentSource) === 'pdflatex') {
          fallbackNotice = 'XeLaTeX is unavailable because its format file is missing. Retrying this compatible source with pdfLaTeX.\n\n';
          result = await compilerRef.current.compile(currentSource, { mainFile: fileName, engine: 'pdflatex' });
          if (queuedSourceRef.current !== null) continue;
          log = [result.error, result.log].filter(Boolean).join('\n');
        }
        log = fallbackNotice + log;
        setCompileLog(log || 'Compilation finished successfully.');
        const foundDiagnostics = parseDiagnostics(log, fileName);
        if (result.success) {
          setDiagnostics(foundDiagnostics.filter((item) => item.severity === 'warning'));
          setCompileStatus('success');
          setCompiledSource(currentSource);
          const bytes = result.pdf.slice();
          setPdfData(bytes);
          setPdfUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
        } else {
          setDiagnostics(foundDiagnostics.length ? foundDiagnostics : [{ line: 0, message: result.error || 'Compilation failed. See the log for details.', severity: 'error' }]);
          setCompileStatus('error');
        }
      } catch (error) {
        if (queuedSourceRef.current !== null) continue;
        const message = error instanceof Error ? error.message : String(error);
        setCompileLog(message);
        setDiagnostics([{ line: 0, message, severity: 'error' }]);
        setCompileStatus('error');
      }
    }
    isCompilingRef.current = false;
  }, [fileName, compileEngine]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (skillModalOpen) searchRef.current?.focus();
        else setSkillModalOpen(true);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void compileSource(code);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [code, compileSource, skillModalOpen]);

  useEffect(() => {
    if (!skillModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSkillModalOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [skillModalOpen]);

  useEffect(() => {
    if (!autoCompile) return;
    const timer = window.setTimeout(() => { void compileSource(code); }, 1400);
    return () => window.clearTimeout(timer);
  }, [code, autoCompile, compileSource]);

  function onCodeChange(value: string) {
    setCode(value);
    setOverrides({});
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    setCode(text);
    const baseName = file.name.replace(/\.[^.]+$/, '').trim().replace(/[^\w.-]+/g, '_') || 'resume';
    setFileName(`${baseName}.tex`);
    setOverrides({});
  }

  function jumpToLine(lineNumber: number) {
    const view = editorViewRef.current;
    if (!view || lineNumber < 1 || lineNumber > view.state.doc.lines) return;
    const line = view.state.doc.line(lineNumber);
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    view.focus();
  }

  function toggleResume(skill: Skill) {
    const currentlyInResume = inResume(skill.name);
    if (currentlyInResume) setCode((current) => removeSkillFromCode(current, skill.name, skillCatalog));
    else setCode((current) => addSkillToCode(current, skill.name, skillCatalog));
    setOverrides((current) => ({ ...current, [skill.name]: !currentlyInResume }));
  }

  function toggleRequired(name: string) {
    setRequired((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function applyJobDescription() {
    if (!applicableJdSkills.length) {
      setJdFeedback('No catalog skills found. Try including technology names such as React, Java, or Docker.');
      return;
    }
    const found = applicableJdSkills.map((skill) => skill.name);
    const nextCatalog = [...skillCatalog, ...newJdSkills];
    const alreadyInResume = scanSkills(code, nextCatalog);
    const addedCount = found.filter((name) => !alreadyInResume.has(name)).length;
    setCustomSkills((current) => {
      const names = new Set(current.map((skill) => skill.name.toLowerCase()));
      return [...current, ...newJdSkills.filter((skill) => !names.has(skill.name.toLowerCase()))];
    });
    setCode((current) => applicableJdSkills.reduce((next, skill) => scanSkills(next, nextCatalog).has(skill.name) ? next : addSkillToCode(next, skill.name, nextCatalog), current));
    setRequired(new Set(found));
    setOverrides((current) => ({ ...current, ...Object.fromEntries(found.map((name) => [name, true])) }));
    setJdFeedback(`Found ${found.length} ${found.length === 1 ? 'skill' : 'skills'}; added ${addedCount} to your resume${newJdSkills.length ? ` and saved ${newJdSkills.length} new ${newJdSkills.length === 1 ? 'technology' : 'technologies'} to your library` : ''}.`);
  }

  function addCustomSkill() {
    const name = customSkillName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (skillCatalog.some((skill) => skill.name.toLowerCase() === name.toLowerCase())) {
      setJdFeedback(`${name} is already in your skill library.`);
      return;
    }
    const skill: Skill = { name, aliases: [], group: inferSkillGroup(name) };
    const nextCatalog = [...skillCatalog, skill];
    setCustomSkills((current) => [...current, skill]);
    setCode((current) => addSkillToCode(current, name, nextCatalog));
    setRequired((current) => new Set([...current, name]));
    setOverrides((current) => ({ ...current, [name]: true }));
    setCustomSkillName('');
    setJdFeedback(`${name} added to your library and resume.`);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  }

  const filteredGroups = [...GROUPS.map((group) => ({
    ...group,
    skills: [
      ...group.skills.map(([name, aliases]) => ({ name, aliases, group: group.id })),
      ...customSkills.filter((skill) => skill.group === group.id),
    ]
      .filter((skill) => !query || `${skill.name} ${skill.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase())),
  })), ...(customSkills.some((skill) => !GROUPS.some((group) => group.id === skill.group)) ? [{ id: 'custom', title: 'Added technologies', icon: '＋', skills: customSkills.filter((skill) => !GROUPS.some((group) => group.id === skill.group)).filter((skill) => !query || skill.name.toLowerCase().includes(query.toLowerCase())) }] : [])]
    .filter((group) => group.skills.length);
  const lintExtension = linter((view) => diagnostics.filter((item) => item.line > 0).map((item) => {
    const line = view.state.doc.line(Math.min(item.line, view.state.doc.lines));
    return { from: line.from, to: line.to, severity: item.severity, message: item.message };
  }));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="downD home">
          <span className="brand-mark">d<span>D</span></span>
          <span className="brand-name">downD</span>
        </a>
        <div className="topbar-right">
          <span className="privacy-pill"><span className="privacy-dot" /> SAVED IN THIS BROWSER</span>
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> RESUME WORKSPACE</div>
          <h1>Make your skills <span>fit the role.</span></h1>
          <p>Shape your resume in LaTeX. Tune your skills for the job, one click at a time.</p>
        </div>
        <div className="intro-actions"><div className="intro-meta"><span className="sparkle">✳</span><span>No account needed<br /><b>Your code stays on this device</b></span></div><button className="jd-open-button" onClick={() => setSkillModalOpen(true)}>Tailor to a job description <span>↗</span></button></div>
      </section>

      <section className="workspace" aria-label="Resume tailoring workspace">
        <div className="editor-panel panel">
          <div className="panel-heading editor-heading">
            <div className="heading-title"><span className="section-icon code-icon">{`</>`}</span><div><h2>Resume source</h2><span className="subheading">Edit your LaTeX directly</span></div></div>
            <div className="editor-actions">
              <span className="file-label" title={fileName}><span className="file-dot" /> {fileName}</span>
              <input ref={uploadRef} className="file-input" type="file" accept=".tex,text/plain,application/x-tex" onChange={uploadResume} aria-label="Upload a LaTeX resume file" />
              <button className="copy-button upload-button" onClick={() => uploadRef.current?.click()}>Upload .tex <span aria-hidden="true">↑</span></button>
              <button className="copy-button" onClick={copyCode}>{copied ? 'Copied!' : 'Copy code'} <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <div className="editor-toolbar"><span><span className="live-dot" /> LIVE EDITOR</span><label className="auto-compile"><input type="checkbox" checked={autoCompile} onChange={(event) => setAutoCompile(event.target.checked)} /> Auto compile</label></div>
          <div className="editor-wrap">
            <CodeMirror
              value={code}
              height="100%"
              aria-label="LaTeX resume source"
              extensions={[latexLanguage, editorTheme, highlightActiveLine(), lintExtension]}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, highlightActiveLineGutter: true, bracketMatching: true, closeBrackets: true, autocompletion: true }}
              onChange={onCodeChange}
              onCreateEditor={(view) => { editorViewRef.current = view; }}
            />
          </div>
          <div className="editor-footer"><span><i className="check-icon">✓</i> Saved on this device</span><span>{code.split('\n').length} lines <b>·</b> {code.length} chars</span></div>
          <div className="compile-console">
            <div className="console-header"><span>COMPILE OUTPUT</span><div className="compile-controls"><label className="engine-select-label" htmlFor="compile-engine">ENGINE</label><select id="compile-engine" className="engine-select" value={compileEngine} onChange={(event) => setCompileEngine(event.target.value as CompileEngine)}><option value="pdflatex">pdfLaTeX</option><option value="xelatex">XeLaTeX</option><option value="auto">Auto</option></select><button className="compile-button" onClick={() => void compileSource(code)} disabled={compileStatus === 'loading' || compileStatus === 'compiling'}>{compileStatus === 'loading' ? 'Loading engine…' : compileStatus === 'compiling' ? 'Compiling…' : 'Compile'} <span>Ctrl ↵</span></button></div></div>
            {diagnostics.length ? <div className="diagnostics-list">
              {diagnostics.slice(0, 5).map((item, index) => <button className={`diagnostic-row ${item.severity}`} key={`${item.line}-${index}`} onClick={() => jumpToLine(item.line)} disabled={item.line < 1}>
                <span className="diagnostic-symbol">{item.severity === 'warning' ? '!' : '×'}</span><span className="diagnostic-message">{item.message}</span>{item.line > 0 && <span className="diagnostic-line">Ln {item.line}</span>}
              </button>)}
            </div> : <div className={`compile-summary ${compileStatus}`}>{compileStatus === 'success' ? '✓  No compile errors' : compileStatus === 'loading' ? 'Preparing the local LaTeX engine…' : compileStatus === 'compiling' ? 'Building your PDF…' : compileStatus === 'error' ? 'Compilation failed. Open the log for details.' : 'Ready to compile your resume.'}</div>}
            {compileLog && <details className="raw-log"><summary>View full compiler log</summary><pre>{compileLog}</pre></details>}
          </div>
        </div>

        <section className="preview-panel panel">
          <div className="panel-heading preview-heading">
            <div className="heading-title"><span className="section-icon preview-icon">▧</span><div><h2>PDF preview</h2><span className="subheading">{compiledSource && compiledSource !== code ? 'Showing last successful compile' : 'Live document output'}</span></div></div>
            <div className="preview-actions">
              {pdfUrl && <a className="preview-link" href={pdfUrl} target="_blank" rel="noreferrer">Open ↗</a>}
              {pdfUrl && <a className="download-button" href={pdfUrl} download={`${fileName.replace(/\.tex$/i, '')}.pdf`} aria-label="Download compiled PDF">↓</a>}
            </div>
          </div>
          <div className="preview-status"><span className={`status-indicator ${compileStatus}`} />{compileStatus === 'success' ? 'PDF is up to date' : compileStatus === 'error' ? 'Fix the errors and compile again' : compileStatus === 'compiling' || compileStatus === 'loading' ? 'Compiling in your browser' : 'Waiting for first compile'}</div>
          <div className="pdf-stage">
            {pdfData ? <Suspense fallback={<div className="pdf-viewer-message">Opening PDF viewer…</div>}><LazyPdfViewer data={pdfData} /></Suspense> : <div className="pdf-empty"><span className="pdf-page-icon">▤</span><b>Your PDF will appear here</b><small>Compile the LaTeX source to preview it.</small><button onClick={() => void compileSource(code)} disabled={compileStatus === 'loading' || compileStatus === 'compiling'}>Compile resume <span>Ctrl ↵</span></button></div>}
          </div>
          <div className="preview-footer"><span>PDFLATEX / XELATEX</span><span>COMPILED LOCALLY</span></div>
        </section>
      </section>
      {skillModalOpen && <div className="skill-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSkillModalOpen(false); }}>
        <section className="skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-modal-title">
          <header className="skill-modal-header">
            <div><span className="eyebrow"><span className="eyebrow-line" /> JOB MATCHER</span><h2 id="skill-modal-title">Tailor your resume to a job</h2><p>Paste a JD to find matching technologies and add them to your LaTeX skills section.</p></div>
            <button className="modal-close" onClick={() => setSkillModalOpen(false)} aria-label="Close job matcher">×</button>
          </header>
          <div className="jd-matcher modal-jd-matcher">
            <label htmlFor="jd-text">JOB DESCRIPTION</label>
            <textarea id="jd-text" value={jdText} onChange={(event) => { setJdText(event.target.value); setJdFeedback(''); }} placeholder="Paste the full job description here…" rows={4} />
            <div className="jd-matcher-actions">
              <span>{applicableJdSkills.length ? `${jdSkills.length} in library · ${newJdSkills.length} new ${newJdSkills.length === 1 ? 'technology' : 'technologies'} found` : 'Matching happens on this device'}</span>
              <button onClick={applyJobDescription} disabled={!applicableJdSkills.length}>Apply skills to resume</button>
            </div>
            {newJdSkills.length > 0 && <div className="new-tech-chips"><span>Will add to library:</span>{newJdSkills.map((skill) => <span className="new-tech-chip" key={skill.name}>{skill.name}</span>)}</div>}
            <form className="custom-skill-form" onSubmit={(event) => { event.preventDefault(); addCustomSkill(); }}>
              <label htmlFor="custom-skill">Missing a technology?</label>
              <div><input id="custom-skill" value={customSkillName} onChange={(event) => setCustomSkillName(event.target.value)} placeholder="Add a technology to your library" /><button type="submit" disabled={!customSkillName.trim()}>Add technology</button></div>
            </form>
            {jdFeedback && <p className="jd-feedback" role="status">{jdFeedback}</p>}
          </div>
          <div className="skill-library-modal">
            <div className="library-modal-heading"><div><h3>Skill library</h3><span>Choose skills manually or review matches from the JD.</span></div><div className="library-totals"><span>{activeCount} in resume</span><span>{requiredCount} for JD</span></div></div>
            <label className="search-box"><span className="search-icon">⌕</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills..." /><kbd>⌘ K</kbd></label>
            <div className="list-head"><span>SKILL SET</span><span>IN RESUME</span><span>FOR JD</span></div>
            <div className="skill-groups modal-skill-groups">
              {filteredGroups.length ? filteredGroups.map((group) => (
                <section className="skill-group" key={group.id}>
                  <h3><span className={`group-icon group-${group.id}`}>{group.icon}</span>{group.title}<span className="group-count">{group.skills.length.toString().padStart(2, '0')}</span></h3>
                  {group.skills.map((skill) => {
                    const present = inResume(skill.name);
                    const needed = required.has(skill.name);
                    const matched = applicableJdSkills.some((item) => item.name === skill.name);
                    return <div className={`skill-row ${present ? 'is-present' : ''} ${needed ? 'is-required' : ''} ${matched ? 'is-jd-match' : ''}`} key={skill.name}>
                      <button className="skill-name" onClick={() => toggleResume(skill)} title={present ? 'Remove from resume' : 'Add to resume'}><span className={`resume-check ${present ? 'checked' : ''}`}>{present ? '✓' : '+'}</span><span>{skill.name}</span>{matched && <small>JD</small>}</button>
                      <button className={`status-cell ${present ? 'present-label' : ''}`} onClick={() => toggleResume(skill)} aria-label={`${present ? 'Remove' : 'Add'} ${skill.name} ${present ? 'from' : 'to'} resume`}>{present ? <span className="tiny-check">✓</span> : <span className="empty-dash">—</span>}</button>
                      <button className={`jd-toggle ${needed ? 'selected' : ''}`} onClick={() => toggleRequired(skill.name)} aria-label={`${needed ? 'Unmark' : 'Mark'} ${skill.name} as needed for job`}><span /></button>
                    </div>;
                  })}
                </section>
              )) : <div className="empty-search"><span>⌕</span><b>No skills found</b><small>Try another search term.</small></div>}
            </div>
          </div>
        </section>
      </div>}
      <footer className="page-footer"><span>DOWND <i>·</i> BUILT FOR THE DETAILS</span><span>LATEX FIRST, ALWAYS <span className="footer-heart">♥</span></span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
