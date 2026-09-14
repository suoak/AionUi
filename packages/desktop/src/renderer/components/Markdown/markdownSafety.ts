/**
 * Keep agent-authored Markdown from hiding source text when a malformed link
 * accidentally absorbs table cells or trailing prose into its destination.
 */
const preserveSuspiciousLinksInText = (markdown: string): string =>
  markdown.replace(
    /(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/g,
    (match, _imagePrefix: string, _label: string, destination: string) => {
      if (!hasUnescapedPipe(destination)) return match;

      const literalLink = match.replace(/(^!?)\[/, '$1\\[').replace(/\b(https?|ftp):\/\//gi, '$1\\://');
      return escapeUnescapedPipes(literalLink);
    }
  );

const transformOutsideInlineCode = (line: string): string => {
  let result = '';
  let segmentStart = 0;
  let codeDelimiterLength = 0;

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '`') continue;
    let delimiterLength = 1;
    while (line[index + delimiterLength] === '`') delimiterLength += 1;

    if (codeDelimiterLength === 0) {
      result += preserveSuspiciousLinksInText(line.slice(segmentStart, index));
      result += '`'.repeat(delimiterLength);
      codeDelimiterLength = delimiterLength;
      segmentStart = index + delimiterLength;
    } else if (codeDelimiterLength === delimiterLength) {
      result += line.slice(segmentStart, index + delimiterLength);
      codeDelimiterLength = 0;
      segmentStart = index + delimiterLength;
    }
    index += delimiterLength - 1;
  }

  result +=
    codeDelimiterLength === 0 ? preserveSuspiciousLinksInText(line.slice(segmentStart)) : line.slice(segmentStart);
  return result;
};

const preserveSuspiciousLinks = (markdown: string): string => {
  const lines = markdown.split('\n');
  let fence: { character: string; length: number } | undefined;

  return lines
    .map((line) => {
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        if (!fence) fence = { character: marker[0], length: marker.length };
        else if (marker[0] === fence.character && marker.length >= fence.length) fence = undefined;
        return line;
      }
      return fence ? line : transformOutsideInlineCode(line);
    })
    .join('\n');
};

const hasUnescapedPipe = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '|') continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashCount += 1;
    if (slashCount % 2 === 0) return true;
  }
  return false;
};

const escapeUnescapedPipes = (value: string): string => {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '|') {
      result += character;
      continue;
    }

    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashCount += 1;
    result += slashCount % 2 === 0 ? '\\|' : '|';
  }
  return result;
};

const splitTableCells = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let codeDelimiterLength = 0;

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === '`') {
      let delimiterLength = 1;
      while (trimmed[index + delimiterLength] === '`') delimiterLength += 1;
      if (codeDelimiterLength === 0) codeDelimiterLength = delimiterLength;
      else if (codeDelimiterLength === delimiterLength) codeDelimiterLength = 0;
      cell += '`'.repeat(delimiterLength);
      index += delimiterLength - 1;
      continue;
    }

    if (character === '|' && codeDelimiterLength === 0) {
      let slashCount = 0;
      for (let cursor = index - 1; cursor >= 0 && trimmed[cursor] === '\\'; cursor -= 1) slashCount += 1;
      if (slashCount % 2 === 0) {
        cells.push(cell.trim());
        cell = '';
        continue;
      }
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
};

const isDelimiterCell = (cell: string): boolean => /^:?-+:?$/.test(cell.trim());

const normalizeDelimiterCell = (cell: string): string => {
  const trimmed = cell.trim();
  const leftAligned = trimmed.startsWith(':');
  const rightAligned = trimmed.endsWith(':');
  return `${leftAligned ? ':' : ''}---${rightAligned ? ':' : ''}`;
};

/**
 * GFM silently drops body cells beyond the delimiter/header width. Expand a
 * recognizable table to its widest row so every generated cell stays visible.
 */
const preserveRaggedTableCells = (markdown: string): string => {
  const lines = markdown.split('\n');
  let insideFence = false;

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (/^\s*(```|~~~)/.test(lines[index])) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence || !hasUnescapedPipe(lines[index])) continue;

    const headerCells = splitTableCells(lines[index]);
    const delimiterCells = splitTableCells(lines[index + 1]);
    if (delimiterCells.length === 0 || !delimiterCells.every(isDelimiterCell)) continue;

    let blockEnd = index + 2;
    let widestRow = headerCells.length;
    while (blockEnd < lines.length && lines[blockEnd].trim() && hasUnescapedPipe(lines[blockEnd])) {
      widestRow = Math.max(widestRow, splitTableCells(lines[blockEnd]).length);
      blockEnd += 1;
    }
    widestRow = Math.max(widestRow, delimiterCells.length);
    if (widestRow > 50) continue;

    const hasInvalidDelimiter = delimiterCells.some((cell) => cell.replace(/:/g, '').length < 3);
    if (widestRow !== headerCells.length || widestRow !== delimiterCells.length || hasInvalidDelimiter) {
      const paddedHeader = [...headerCells, ...Array<string>(widestRow - headerCells.length).fill('')];
      const paddedDelimiter = [
        ...delimiterCells.map(normalizeDelimiterCell),
        ...Array<string>(widestRow - delimiterCells.length).fill('---'),
      ];
      lines[index] = `| ${paddedHeader.join(' | ')} |`;
      lines[index + 1] = `| ${paddedDelimiter.join(' | ')} |`;
    }
    index = blockEnd - 1;
  }

  return lines.join('\n');
};

/** Prepare chat Markdown without changing ordinary, well-formed documents. */
export const prepareTolerantChatMarkdown = (markdown: string): string =>
  preserveRaggedTableCells(preserveSuspiciousLinks(markdown));
