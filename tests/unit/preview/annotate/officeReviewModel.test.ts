import { describe, expect, it } from 'vitest';
import { projectFileRef, localFileRef } from '@/common/types/chatFile';
import type { ReviewThread } from '@/common/types/agent/taskSession';
import {
  buildOfficeAnchorInput,
  buildOfficeReviewScope,
  formatOfficeThreadTarget,
  sanitizeRelativePath,
  stripWorkspacePrefix,
} from '@/renderer/pages/conversation/Preview/components/annotate/officeReviewModel';

const thread = (over: Partial<ReviewThread> = {}): ReviewThread => ({
  id: 't1',
  scope_kind: 'task_run',
  scope_id: 'office:c1',
  file_path: 'decks/q1.pptx',
  side: 'new',
  start_line: 3,
  end_line: 3,
  status: 'open',
  moved_fuzzy: false,
  anchor: { v: 1, before: [], lines: ['Slide 3'], after: [], hunk_header: 'Slide 3 · Chart' },
  comments: [],
  created_at: 1,
  updated_at: 1,
  ...over,
});

describe('sanitizeRelativePath', () => {
  it('normalizes backslashes, strips leading slashes, and drops empty segments', () => {
    expect(sanitizeRelativePath('\\docs\\\\a.pptx')).toBe('docs/a.pptx');
    expect(sanitizeRelativePath('/docs//a.pptx')).toBe('docs/a.pptx');
    expect(sanitizeRelativePath('./docs/./a.pptx')).toBe('docs/a.pptx');
  });

  it('rejects parent segments and Windows drive prefixes', () => {
    expect(sanitizeRelativePath('docs/../secret.pptx')).toBe('');
    expect(sanitizeRelativePath('C:\\Users\\a.pptx')).toBe('Users/a.pptx');
    expect(sanitizeRelativePath('C:/docs/a.pptx')).toBe('docs/a.pptx');
    expect(sanitizeRelativePath('')).toBe('');
  });
});

describe('stripWorkspacePrefix', () => {
  it('strips a POSIX workspace prefix', () => {
    expect(stripWorkspacePrefix('/home/u/proj/docs/a.pptx', '/home/u/proj')).toBe('docs/a.pptx');
    expect(stripWorkspacePrefix('/home/u/proj/docs/a.pptx', '/home/u/proj/')).toBe('docs/a.pptx');
  });

  it('strips a Windows workspace prefix case-insensitively', () => {
    expect(stripWorkspacePrefix('C:\\Users\\foo\\proj\\docs\\a.pptx', 'C:\\Users\\foo\\proj')).toBe('docs/a.pptx');
    expect(stripWorkspacePrefix('c:/Users/foo/proj/docs/a.pptx', 'C:/Users/foo/proj')).toBe('docs/a.pptx');
  });

  it('returns undefined when the file is outside the workspace', () => {
    expect(stripWorkspacePrefix('/other/a.pptx', '/home/u/proj')).toBeUndefined();
    expect(stripWorkspacePrefix('/home/u/proj', '/home/u/proj')).toBeUndefined();
  });
});

describe('buildOfficeReviewScope', () => {
  it('returns undefined when no file identity is present', () => {
    expect(buildOfficeReviewScope({ workspace: '/ws', routeHash: '#/conversation/c1' })).toBeUndefined();
  });

  it('uses a task_run scope id of office:<conversation> from the hash route', () => {
    const scope = buildOfficeReviewScope({
      fileName: 'deck.pptx',
      routeHash: '#/conversation/conv%2Fone',
    });
    expect(scope).toMatchObject({
      scope_kind: 'task_run',
      scope_id: 'office:conv/one',
      conversation_id: 'conv/one',
      file_path: 'deck.pptx',
    });
  });

  it('falls back to office:<workspace> then office:workspace, truncated to 4096 chars', () => {
    expect(buildOfficeReviewScope({ fileName: 'a.pptx', workspace: '/tmp/ws' })?.scope_id).toBe('office:/tmp/ws');
    expect(buildOfficeReviewScope({ fileName: 'a.pptx' })?.scope_id).toBe('office:workspace');
    const huge = 'w'.repeat(5000);
    const scope = buildOfficeReviewScope({ fileName: 'a.pptx', workspace: huge });
    expect(scope?.scope_id).toHaveLength(4096);
    expect(scope?.scope_id.startsWith('office:')).toBe(true);
    expect(scope?.conversation_id).toBeUndefined();
  });

  it('prefers a project relative_path and never prefixes pe:', () => {
    const scope = buildOfficeReviewScope({
      fileRef: projectFileRef('pe1', 'slides\\q1.pptx'),
      filePath: 'C:\\ignored\\absolute.pptx',
      fileName: 'ignored.pptx',
      workspace: 'C:\\ignored',
      routeHash: '#/conversation/c1',
    });
    expect(scope?.file_path).toBe('slides/q1.pptx');
    expect(scope?.file_path.startsWith('pe:')).toBe(false);
    expect(scope?.scope_id).toBe('office:c1');
  });

  it('rejects .. in a project relative_path and falls back to the basename', () => {
    expect(buildOfficeReviewScope({ fileRef: projectFileRef('pe1', '../secret.pptx') })?.file_path).toBe('secret.pptx');
    expect(buildOfficeReviewScope({ fileRef: projectFileRef('pe1', '..') })?.file_path).toBe('document');
  });

  it('strips the workspace prefix from a local path, including Windows paths', () => {
    expect(
      buildOfficeReviewScope({
        filePath: '/home/u/proj/docs/a.xlsx',
        workspace: '/home/u/proj',
        fileName: 'ignored.xlsx',
      })?.file_path
    ).toBe('docs/a.xlsx');
    expect(
      buildOfficeReviewScope({
        fileRef: localFileRef('C:\\Users\\foo\\proj\\budget.xlsx'),
        filePath: 'C:\\Users\\foo\\proj\\budget.xlsx',
        workspace: 'C:\\Users\\foo\\proj',
      })?.file_path
    ).toBe('budget.xlsx');
  });

  it('falls back to the basename when the path is outside the workspace or has a drive letter', () => {
    expect(buildOfficeReviewScope({ filePath: '/other/abs/report.docx', workspace: '/home/u/proj' })?.file_path).toBe(
      'report.docx'
    );
    expect(buildOfficeReviewScope({ filePath: 'C:\\Temp\\report.docx' })?.file_path).toBe('report.docx');
    expect(buildOfficeReviewScope({ filePath: 'pe:abc/docs/file.pptx' })?.file_path).toBe('file.pptx');
    expect(buildOfficeReviewScope({ fileName: 'My Deck.pptx' })?.file_path).toBe('My Deck.pptx');
    expect(buildOfficeReviewScope({ fileName: '', filePath: '' })).toBeUndefined();
  });

  it('always emits a path that passes Core normalize_file_path rules', () => {
    const paths = [
      buildOfficeReviewScope({ filePath: 'C:/foo/../bar.pptx', workspace: 'C:/foo' })?.file_path,
      buildOfficeReviewScope({ fileRef: projectFileRef('pe1', '/docs//a.pptx') })?.file_path,
      buildOfficeReviewScope({ fileName: '///' })?.file_path,
    ];
    for (const filePath of paths) {
      expect(filePath).toBeTruthy();
      expect(filePath?.startsWith('/')).toBe(false);
      expect(/^[a-zA-Z]:/.test(filePath ?? '')).toBe(false);
      expect(filePath?.split('/').includes('..')).toBe(false);
      expect(filePath?.split('/').some((part) => part === '')).toBe(false);
    }
  });
});

describe('buildOfficeAnchorInput', () => {
  it('builds a 1-line office-artifact context that matches the unit range', () => {
    const anchor = buildOfficeAnchorInput({
      unitNumber: 3,
      unitLabel: 'Slide',
      elementLabel: 'Chart',
      snippet: 'Q1 revenue\nchart',
    });
    expect(anchor).toEqual({
      side: 'new',
      start_line: 3,
      end_line: 3,
      diff_context: {
        base: 'office-artifact',
        hunk_header: 'Slide 3 · Chart',
        before: [],
        lines: ['Q1 revenue chart'],
        after: [],
      },
    });
    expect(anchor.diff_context.lines).toHaveLength(anchor.end_line - anchor.start_line + 1);
  });

  it('clamps the unit number to >= 1 and always keeps a single collapsed line', () => {
    const anchor = buildOfficeAnchorInput({ unitNumber: 0, unitLabel: 'Page', snippet: '  a \n\n b  ' });
    expect(anchor.start_line).toBe(1);
    expect(anchor.end_line).toBe(1);
    expect(anchor.diff_context.lines).toEqual(['a b']);
    expect(anchor.diff_context.hunk_header).toBe('Page 1');
    const nan = buildOfficeAnchorInput({ unitNumber: Number.NaN, unitLabel: 'Row' });
    expect(nan.start_line).toBe(1);
    expect(nan.diff_context.lines).toEqual(['Row 1']);
  });
});

const formatT = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe('formatOfficeThreadTarget', () => {
  const t = formatT;

  it('prefers the hunk header, then the unit number for the document type', () => {
    expect(formatOfficeThreadTarget(thread(), 'presentation', t)).toBe('Slide 3 · Chart');
    expect(formatOfficeThreadTarget(thread({ anchor: { v: 1, before: [], lines: [], after: [] } }), 'word', t)).toBe(
      'preview.officeReview.page {"number":3}'
    );
    expect(formatOfficeThreadTarget(thread({ anchor: { v: 1, before: [], lines: [], after: [] } }), 'excel', t)).toBe(
      'preview.officeReview.row {"number":3}'
    );
    expect(formatOfficeThreadTarget(thread({ anchor: { v: 1, before: [], lines: [], after: [] } }), 'ppt', t)).toBe(
      'preview.officeReview.slide {"number":3}'
    );
  });
});
