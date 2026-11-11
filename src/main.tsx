import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const STORAGE_KEY = 'tailor-tex-workspace-v1';
type Skill = { name: string; aliases: string[]; group: string };
type SkillGroup = { id: string; title: string; icon: string; skills: [string, string[]][] };
type SavedState = { code: string; required: string[]; overrides: Record<string, boolean>; fileName?: string };
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
const SKILL_BY_NAME = new Map<string, Skill>(ALL_SKILLS.map((skill) => [skill.name, skill]));
const START = '% tailor.tex:skills:start';
const END = '% tailor.tex:skills:end';

function normalize(value: string) {
  return value.toLowerCase().replace(/\\textit\{|\\textbf\{|\\emph\{|[{}\\]/g, '').replace(/[^a-z0-9+#.]/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSkillInText(text: string, skill: Skill) {
  const normalizedText = normalize(text);
  return [skill.name, ...skill.aliases].some((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm && new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?=$|[^a-z0-9])`).test(normalizedText);
  });
}

function getSkillsSectionRange(code: string): { start: number; end: number } | null {
  const heading = /\\section\*?\s*\{\s*(?:technical\s+)?skills\s*\}/ig;
  const match = heading.exec(code);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = code.slice(start);
  const next = /\\section\*?\s*\{/i.exec(rest);
  const end = next ? start + next.index : (code.indexOf('\\end{document}', start) >= 0 ? code.indexOf('\\end{document}', start) : code.length);
  return { start, end };
}

function scanSkills(code: string): Set<string> {
  const range = getSkillsSectionRange(code);
  const scanText = range ? code.slice(range.start, range.end) : code;
  return new Set(ALL_SKILLS.filter((skill) => findSkillInText(scanText, skill)).map((skill) => skill.name));
}

function buildManagedBlock(names: Set<string>) {
  const grouped = GROUPS.map((group) => {
    const items = [...names].filter((name) => SKILL_BY_NAME.get(name)?.group === group.id);
    return items.length ? `\\textbf{${group.title}:} ${items.join(', ')} \\\\` : null;
  }).filter(Boolean);
  return [START, ...grouped, END].join('\n');
}

function addSkillToCode(code: string, skillName: string) {
  const selected = new Set<string>();
  const existingBlock = code.match(new RegExp(`${escapeRegExp(START)}([\\s\\S]*?)${escapeRegExp(END)}`));
  if (existingBlock) {
    for (const skill of ALL_SKILLS) if (findSkillInText(existingBlock[1], skill)) selected.add(skill.name);
  }
  selected.add(skillName);
  const block = buildManagedBlock(selected);
  if (existingBlock) return code.replace(existingBlock[0], block);

  const section = getSkillsSectionRange(code);
  if (section) {
    return `${code.slice(0, section.end).trimEnd()}\n${block}\n${code.slice(section.end).replace(/^\s*/, '\n')}`;
  }

  const endDocument = code.lastIndexOf('\\end{document}');
  const newSection = `\\section*{Skills}\n${block}`;
  if (endDocument >= 0) return `${code.slice(0, endDocument).trimEnd()}\n\n${newSection}\n\n${code.slice(endDocument)}`;
  return `${code.trimEnd()}\n\n${newSection}\n`;
}

function removeSkillFromCode(code: string, skillName: string) {
  const skill = SKILL_BY_NAME.get(skillName);
  if (!skill) return code;
  const range = getSkillsSectionRange(code);
  if (!range) return code;
  const original = code.slice(range.start, range.end);
  const managed = original.match(new RegExp(`${escapeRegExp(START)}([\\s\\S]*?)${escapeRegExp(END)}`));
  if (managed) {
    const names = ALL_SKILLS.filter((item) => item.name !== skillName && findSkillInText(managed[1], item)).map((item) => item.name);
    const replacement = names.length ? buildManagedBlock(new Set(names)) : '';
    const changed = original.replace(managed[0], replacement);
    return `${code.slice(0, range.start)}${changed}${code.slice(range.end)}`;
  }

  // Existing resume entries are commonly comma or semicolon separated. Limit
  // removals to the Skills section and preserve the rest of each line.
  const variants = [skill.name, ...skill.aliases].sort((a, b) => b.length - a.length);
  let changed = original;
  for (const variant of variants) {
    const token = new RegExp(`(^|[,;]\\s*)${escapeRegExp(variant)}(?=\\s*([,;]|$))`, 'ig');
    changed = changed.replace(token, (_whole, prefix: string) => (prefix.trim() ? '' : ''));
  }
  changed = changed.replace(/,\s*,/g, ',').replace(/;\s*;/g, ';').replace(/[;,]\s*(?=\\|$)/gm, '').replace(/^[\s,;]+|[\s,;]+$/gm, '');
  return `${code.slice(0, range.start)}${changed}${code.slice(range.end)}`;
}

function readSavedState(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved.code === 'string') return saved;
  } catch { /* Start with a clean local workspace if saved data is unreadable. */ }
  return { code: STARTER, required: [], overrides: {}, fileName: 'resume.tex' };
}

function App() {
  const [initial] = useState(readSavedState);
  const [code, setCode] = useState(initial.code);
  const [required, setRequired] = useState<Set<string>>(new Set(initial.required || []));
  const [overrides, setOverrides] = useState(initial.overrides || {});
  const [fileName, setFileName] = useState(initial.fileName || 'resume.tex');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const detected = useMemo(() => scanSkills(code), [code]);
  const inResume = (name: string): boolean => Object.hasOwn(overrides, name) ? overrides[name] : detected.has(name);
  const activeCount = ALL_SKILLS.filter((skill) => inResume(skill.name)).length;
  const requiredCount = required.size;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, required: [...required], overrides, fileName }));
  }, [code, required, overrides, fileName]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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
    setFileName(file.name);
    setOverrides({});
  }

  function toggleResume(skill: Skill) {
    const currentlyInResume = inResume(skill.name);
    if (currentlyInResume) setCode((current) => removeSkillFromCode(current, skill.name));
    else setCode((current) => addSkillToCode(current, skill.name));
    setOverrides((current) => ({ ...current, [skill.name]: !currentlyInResume }));
  }

  function toggleRequired(name: string) {
    setRequired((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  }

  const filteredGroups = GROUPS.map((group) => ({
    ...group,
    skills: group.skills.map(([name, aliases]) => ({ name, aliases, group: group.id }))
      .filter((skill) => !query || `${skill.name} ${skill.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => group.skills.length);

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
        <div className="intro-meta"><span className="sparkle">✳</span><span>No account needed<br /><b>Your code stays on this device</b></span></div>
      </section>

      <section className="workspace" aria-label="Resume tailoring workspace">
        <aside className="skills-panel panel">
          <div className="panel-heading skills-heading">
            <div className="heading-title"><span className="section-icon skills-icon">✳</span><div><h2>Skills library</h2><span className="subheading">Pick what the role calls for</span></div></div>
            <button className="more-button" aria-label="Skill library information" title="Select a skill to add or remove it from your resume. Use the JD toggle to mark what the role requires.">···</button>
          </div>
          <div className="stats-row">
            <div className="stat-card"><span className="stat-label">IN YOUR RESUME</span><div><strong>{activeCount.toString().padStart(2, '0')}</strong><span className="stat-caption">skills</span></div></div>
            <div className="stat-card required-stat"><span className="stat-label">NEEDED FOR JD</span><div><strong>{requiredCount.toString().padStart(2, '0')}</strong><span className="stat-caption">selected</span></div></div>
          </div>
          <label className="search-box"><span className="search-icon">⌕</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills..." /><kbd>⌘ K</kbd></label>
          <div className="list-head"><span>SKILL SET</span><span>IN RESUME</span><span>FOR JD</span></div>
          <div className="skill-groups">
            {filteredGroups.length ? filteredGroups.map((group) => (
              <section className="skill-group" key={group.id}>
                <h3><span className={`group-icon group-${group.id}`}>{group.icon}</span>{group.title}<span className="group-count">{group.skills.length.toString().padStart(2, '0')}</span></h3>
                {group.skills.map((skill) => {
                  const present = inResume(skill.name);
                  const needed = required.has(skill.name);
                  return <div className={`skill-row ${present ? 'is-present' : ''} ${needed ? 'is-required' : ''}`} key={skill.name}>
                    <button className="skill-name" onClick={() => toggleResume(skill)} title={present ? 'Remove from resume' : 'Add to resume'}><span className={`resume-check ${present ? 'checked' : ''}`}>{present ? '✓' : '+'}</span><span>{skill.name}</span></button>
                    <button className={`status-cell ${present ? 'present-label' : ''}`} onClick={() => toggleResume(skill)} aria-label={`${present ? 'Remove' : 'Add'} ${skill.name} ${present ? 'from' : 'to'} resume`}>{present ? <span className="tiny-check">✓</span> : <span className="empty-dash">—</span>}</button>
                    <button className={`jd-toggle ${needed ? 'selected' : ''}`} onClick={() => toggleRequired(skill.name)} aria-label={`${needed ? 'Unmark' : 'Mark'} ${skill.name} as needed for job`}><span /></button>
                  </div>;
                })}
              </section>
            )) : <div className="empty-search"><span>⌕</span><b>No skills found</b><small>Try another search term.</small></div>}
          </div>
          <div className="panel-footnote"><span>✳</span> Catalog skills are matched against your LaTeX source.</div>
        </aside>

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
          <div className="editor-toolbar"><span><span className="live-dot" /> LIVE EDITOR</span><span>LaTeX <span className="toolbar-divider">/</span> UTF-8</span></div>
          <div className="editor-wrap">
            <div className="line-numbers" aria-hidden="true">{code.split('\n').map((_, index) => <span key={index}>{String(index + 1).padStart(2, '0')}</span>)}</div>
            <textarea aria-label="LaTeX resume source" spellCheck="false" value={code} onChange={(event) => onCodeChange(event.target.value)} />
          </div>
          <div className="editor-footer"><span><i className="check-icon">✓</i> Saved automatically on this device</span><span>{code.split('\n').length} lines <b>·</b> {code.length} chars</span></div>
          <div className="tip-card"><span className="tip-icon">✦</span><p><b>Quick tip</b><br />Select a skill on the left to add it to your LaTeX Skills section.</p><span className="tip-arrow">↗</span></div>
        </div>
      </section>
      <footer className="page-footer"><span>DOWND <i>·</i> BUILT FOR THE DETAILS</span><span>LATEX FIRST, ALWAYS <span className="footer-heart">♥</span></span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
