// File-name search for chiikawa-files: fuzzy path matching and the one command that lists every file under a folder.
// Copied unchanged from mods/my-files/logic.js in https://github.com/ssenu/Herdr-UI (Apache-2.0, see LICENSE here).

// Letters of `part` in order inside `lower` from index `from`: their positions, or null.
function subsequence(lower, part, from) {
  const out = [];
  let j = from;
  for (const ch of part) {
    const i = lower.indexOf(ch, j);
    if (i < 0) return null;
    out.push(i);
    j = i + ch.length;
  }
  return out;
}

const wordStart = (path, i) => i === 0 || "/.-_ ".includes(path[i - 1]) || (/[a-z]/.test(path[i - 1]) && /[A-Z]/.test(path[i]));

// Lowercase per code point so every index maps 1:1 to the original string: when the lowercase form
// changes the length (e.g. "İ" -> "i" + combining dot), use its first code point if that keeps the
// length, otherwise keep the original character.
function lowerAligned(s) {
  const fast = s.toLowerCase();
  if (fast.length === s.length) return fast;
  let out = "";
  for (const ch of s) {
    const l = ch.toLowerCase();
    if (l.length === ch.length) out += l;
    else {
      const first = String.fromCodePoint(l.codePointAt(0));
      out += first.length === ch.length ? first : ch;
    }
  }
  return out;
}

// Score (and, with wantHits, matched code-unit positions) of every query part against path, or null.
function matchParts(parts, path, wantHits) {
  const lower = lowerAligned(path), nameStart = path.lastIndexOf("/") + 1, hits = wantHits ? new Set() : null;
  let score = -path.length;
  for (const part of parts) {
    let found = subsequence(lower, part, nameStart), inName = true;
    if (!found) { found = subsequence(lower, part, 0); inName = false; }
    if (!found) return null;
    if (inName) score += 100;
    let prev = -2;
    for (const i of found) {
      score += 10;
      if (i === prev + 1) score += 15;
      if (wordStart(path, i)) score += 20;
      prev = i;
      if (hits) {
        hits.add(i);
        if (path.codePointAt(i) > 0xffff) hits.add(i + 1);
      }
    }
  }
  return wantHits ? { score, hits: [...hits].sort((x, y) => x - y) } : { score };
}

const queryParts = query => lowerAligned(String(query ?? "")).split(/\s+/).filter(Boolean);

/**
 * Fuzzy file-path match: every space-separated part of the query must appear in order (ignoring case),
 * tried in the file name first, then the whole path. Higher score is better; hits are matched positions.
 */
export function fuzzyMatch(query, path) {
  const parts = queryParts(query);
  return parts.length ? matchParts(parts, path, true) : null;
}

/** Matching paths, best first (then shorter, then alphabetical); at most `limit`, `more` if cut. */
export function searchPaths(paths, query, limit) {
  const parts = queryParts(query), all = [];
  if (!parts.length) return { results: [], more: false };
  for (const path of paths) {
    const m = matchParts(parts, path, false);
    if (m) all.push({ path, score: m.score });
  }
  all.sort((a, b) => b.score - a.score || a.path.length - b.path.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const results = all.slice(0, limit).map(r => ({ path: r.path, ...matchParts(parts, r.path, true) }));
  return { results, more: all.length > limit };
}

/** "a/b/c.txt" → { dir: "a/b", name: "c.txt" }. */
export function splitPath(path) {
  const i = path.lastIndexOf("/");
  return { dir: i < 0 ? "" : path.slice(0, i), name: path.slice(i + 1) };
}

/** Runs of matched / unmatched characters, for highlighting. */
export function segments(text, hits) {
  const set = new Set(hits), out = [];
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i), last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({ text: text[i], hit });
  }
  return out;
}

/** How many paths the search index keeps. */
export const INDEX_LIMIT = 50000;

/** A PowerShell single-quoted literal. PowerShell also reads typographic single quotes as quotes. */
export function psQuote(s) {
  return "'" + String(s).replace(/['‘’‚‛]/g, m => m + m) + "'";
}

/**
 * One command listing every file under root (relative paths, one per line), skipping .git folders
 * and not following links or junctions (OneDrive placeholder folders, reparse points without a link type, are entered). Stops after INDEX_LIMIT + 1 lines. Fails if root is missing.
 */
export function indexCommand(root, windows) {
  if (windows) {
    const script = [
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
      `$root = ${psQuote(root)}`,
      "if (-not [IO.Directory]::Exists($root)) { [Console]::Error.Write('folder not found'); exit 1 }",
      `$limit = ${INDEX_LIMIT + 1}; $n = 0`,
      "$sb = [Text.StringBuilder]::new(); $stack = [Collections.Generic.Stack[string]]::new(); $stack.Push($root)",
      "while ($stack.Count -gt 0 -and $n -lt $limit) { $d = $stack.Pop(); " +
        "try { foreach ($f in [IO.Directory]::EnumerateFiles($d)) { [void]$sb.Append($f.Substring($root.Length).TrimStart('\\', '/')).Append(\"`n\"); $n++; if ($n -ge $limit) { break } } } catch {}; " +
        "try { foreach ($s in [IO.Directory]::EnumerateDirectories($d)) { if ([IO.Path]::GetFileName($s) -eq '.git') { continue }; " +
        "if ([IO.File]::GetAttributes($s) -band [IO.FileAttributes]::ReparsePoint) { if ((Get-Item -LiteralPath $s -Force).LinkType) { continue } }; $stack.Push($s) } } catch {} }",
      "[Console]::Out.Write($sb.ToString())",
    ].join("; ");
    return { command: "powershell", args: ["-NoProfile", "-Command", script] };
  }
  const script = `cd -- "$1" || exit 1; find . -name .git -prune -o -type f -print | head -n ${INDEX_LIMIT + 1}`;
  return { command: "sh", args: ["-c", script, "index", root] };
}

/** indexCommand's output → relative "/" paths (at most INDEX_LIMIT) and whether it was cut. */
export function indexLines(stdout, windows) {
  const paths = [];
  for (const raw of String(stdout ?? "").split("\n")) {
    let line = raw.replace(/\r$/, "");
    if (windows) line = line.replaceAll("\\", "/");
    line = line.replace(/^\.\//, "");
    if (line) paths.push(line);
  }
  const truncated = paths.length > INDEX_LIMIT;
  return { paths: truncated ? paths.slice(0, INDEX_LIMIT) : paths, truncated };
}
