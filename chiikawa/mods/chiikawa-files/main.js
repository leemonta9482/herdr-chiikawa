// A lazy file browser for the focused pane's folder. Clone of the shipped `files`:
// - text files open editable (this computer or another machine); Save button or Ctrl+S writes them back
// - ".." row walks above the terminal's folder; closing and reopening the panel keeps where you were;
//   clicking the "Files" title goes back to the terminal's folder
// - drag a row out of the panel and release: its absolute path is pasted into the focused terminal
// - .md files open rendered ([보기]/[편집]); the open file follows disk changes, or shows a conflict bar
//   when it has unsaved edits (both ideas from https://github.com/ssenu/Herdr-UI, Apache-2.0)
// - a search box finds files by name under the folder, a 바탕화면 chip browses the Desktop, and each row's ⋯
//   opens chiikawa-files-open (search code, chip and ⋯ from the same repository's my-files; see LICENSE here)
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, writeTextFile, watchFolder, theme, settings, window, nextCommand, notify, openOverlay, appHome, layout, shared, run } from "herdr";
import * as fs from "fs/promises";
import { searchPaths, splitPath, segments, indexCommand, indexLines, switchQuery } from "./search.js";

// Writes a file on another machine: text -> temp file under the app home -> `hc file write --on < temp`.
async function upload(on, full, text) {
  const dir = `${appHome()}/data`, id = `chiikawa-files-upload-${Date.now()}`;
  const tmp = `${dir}/${id}.tmp`, bat = `${dir}/${id}.cmd`, win = p => p.replace(/\//g, "\\");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, text);
  try {
    let r;
    if (window()?.platform === "windows") {
      // A tiny UTF-8 batch file: cmd redirects stdin byte for byte in ~80 ms (PowerShell Start-Process took ~1.2 s).
      // ponytail: a remote path containing `"` would break the batch quoting; such paths aren't handled.
      const pct = s => s.replace(/%/g, "%%");
      await fs.writeFile(bat, `@chcp 65001 >nul\r\n@hc file write --on "${pct(on)}" "${pct(full)}" < "${pct(win(tmp))}"\r\n`);
      r = await exec("cmd", ["/d", "/c", win(bat)]);
    } else r = await exec("sh", ["-c", 'hc file write --on "$1" "$2" < "$3"', "upload", on, full, tmp]);
    if (r.code !== 0) throw new Error(r.stderr || `hc file write exited ${r.code}`);
  } finally { await fs.unlink(tmp).catch(() => {}); await fs.unlink(bat).catch(() => {}); }
}

const LF = s => s.replace(/\r\n/g, "\n");
const PANEL = "files";
// Panel motion, same in chiikawa-files / -changes / -github: slide in when this panel becomes the shown one,
// slide out on chiikawa-tabs' close signal (shared "chiikawa-panel.close" = { id, t }), then hide the panel.
// ponytail: a hidden panel isn't rendered, so a 300 ms layout() poll notes "was hidden" (no redraw).
const findNode = (n, id) => !n ? null : n.id === id ? n : (n.children ?? []).reduce((hit, c) => hit ?? findNode(c, id), null);
function panelShown() { const L = layout(), p = findNode(L, "panel"), b = findNode(L, "panel-body"); return !p || (!p.hidden && (!b || b.active === PANEL)); }
function motionInit(view, cx) {
  view.enter = true; view.closeSeen = shared("chiikawa-panel.close")?.t ?? 0;
  cx.timer.every(300, () => { if (!panelShown()) view.wasHidden = true; });
}
function motionTick(view, cx) {
  if (view.wasHidden && panelShown()) { view.wasHidden = false; view.enter = false; cx.timer.after(16, cx => { view.enter = true; cx.notify(); }); }
  const c = shared("chiikawa-panel.close");
  if (c?.id === PANEL && c.t > view.closeSeen) { view.closeSeen = c.t; view.enter = false; cx.timer.after(200, () => run("layout.hide", { id: "panel" })); }
}
const isMarkdown = p => /\.(md|markdown)$/i.test(p ?? ""); // opens in the rendered view first
const join = (root, path) => path ? root.replace(/[\\/]+$/, "") + "/" + path : root;

// "C:\a\b" -> "C:\a", "C:\a" -> "C:\", "/a" -> "/", roots -> null
function parent(dir) {
  const d = dir.replace(/[\\/]+$/, ""), i = Math.max(d.lastIndexOf("/"), d.lastIndexOf("\\"));
  if (i < 0) return null;
  const p = d.slice(0, i);
  if (p === "") return "/";
  return /^[A-Za-z]:$/.test(p) ? p + "\\" : p;
}

// `browse`: a folder picked with "..", else the focused pane's folder.
function location(browse) {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: browse || pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = browse => JSON.stringify(location(browse));
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
const MAX_INDEXES = 4, RESULT_LIMIT = 200, REMOTE_INDEX_MS = 60000;

// Whether a machine runs Windows (no `sh` there: folders are listed with PowerShell). Detected once per machine.
const winMachine = new Map();
async function isWindows(on) {
  if (!on) return window()?.platform === "windows";
  if (winMachine.has(on)) return winMachine.get(on);
  // Only a reply is remembered: an offline machine is asked again next time.
  const r = await exec("cmd", ["/d", "/c", "ver"], { on }).catch(() => null);
  if (r) winMachine.set(on, r.code === 0);
  return r?.code === 0;
}

async function directory(path, on) {
  if (await isWindows(on)) {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Reparse points keep directory attributes even when dangling; check their target.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replaceAll("'", "''") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  }
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map(); this.browse = null; this.drag = null;
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    // File search: the query, the selected result, and per-folder indexes (context key → index).
    this.query = ""; this.at = 0; this.indexes = new Map(); this.found = null;
    this.queries = new Map(); this.querySpace = undefined; // each space keeps its own search
    this.search = InputState.new({ placeholder: "이 폴더에서 파일 찾기" });
    this.search.on("change", (_e, cx) => {
      if (this.search.value() === this.query) return; // syncQuery put it there
      this.query = this.search.value(); this.at = 0; this.ensureIndex(cx); cx.notify();
    });
    this.search.on("submit", (_e, cx) => { this.openResult(cx); cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
    motionInit(this, cx);
    cx.spawn(async cx => { for (;;) { if (await nextCommand() === "save") this.save(cx); } });
    this.findDesktop(cx);
  }

  // The real Desktop folder (OneDrive or a localized name can move it), asked of Windows once.
  findDesktop(cx) {
    if (window()?.platform !== "windows") return;
    cx.spawn(async cx => {
      try {
        const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Environment]::GetFolderPath('Desktop')"]);
        const path = r.code === 0 ? r.stdout.trim() : "";
        if (path) { this.desktop = path; cx.notify(); }
      } catch {}
    });
  }

  // 바탕화면 chip: browse the Desktop like a ".." pick; pressed again (or the Files title), back to the terminal's folder.
  toggleDesktop(cx) {
    if (!this.desktop || this.dirty) return;
    this.browse = this.browse === this.desktop ? null : this.desktop;
    this.refresh(cx);
  }

  // The active space changed: its own search comes back. The input is set after this render.
  syncQuery(cx) {
    const space = spaces().find(s => s.active)?.id ?? null;
    if (space === this.querySpace) return;
    const next = switchQuery(this.queries, this.querySpace, space, this.query);
    this.querySpace = space;
    if (next === this.query) return;
    this.query = next; this.at = 0;
    cx.timer.after(0, cx => { if (this.search.value() !== this.query) this.search.set_value(this.query); this.ensureIndex(cx); cx.notify(); });
  }

  // Builds (or rebuilds, when stale) the file list the search filters. Old results stay meanwhile.
  ensureIndex(cx) {
    const context = this.context;
    if (!this.query.trim() || !context?.cwd) return;
    const old = this.indexes.get(context.key);
    if (old) { this.indexes.delete(context.key); this.indexes.set(context.key, old); }
    const outdated = !old || old.stale || Boolean(old.error) || (Boolean(context.on) && Date.now() - old.builtAt > REMOTE_INDEX_MS);
    if (old?.building || !outdated) return;
    const index = { paths: old?.paths ?? null, truncated: old?.truncated ?? false, builtAt: 0, stale: false, building: true, error: null };
    this.indexes.delete(context.key);
    this.indexes.set(context.key, index);
    for (const k of [...this.indexes.keys()]) {
      if (this.indexes.size <= MAX_INDEXES) break;
      if (k !== this.context?.key && k !== context.key) this.indexes.delete(k);
    }
    cx.spawn(async cx => {
      try {
        const windows = await isWindows(context.on); // remote Windows machines too (the original assumed sh there)
        const c = indexCommand(context.cwd, windows);
        const r = await exec(c.command, c.args, { on: context.on });
        if (r.code !== 0) throw new Error((r.stderr || "").trim() || `exit ${r.code}`);
        const { paths, truncated } = indexLines(r.stdout, windows);
        index.paths = paths; index.truncated = truncated;
      } catch (e) {
        index.error = String(e?.message ?? e);
      } finally {
        index.building = false; index.builtAt = Date.now();
        cx.notify();
      }
    });
  }

  index() {
    if (!this.context) return null;
    const index = this.indexes.get(this.context.key);
    if (!index) return null;
    this.indexes.delete(this.context.key); this.indexes.set(this.context.key, index);
    return index;
  }

  // Search results for the current query, cached per (query, index paths).
  results() {
    const q = this.query.trim(), paths = this.index()?.paths;
    if (!q || !paths) return null;
    if (this.found?.q !== q || this.found.paths !== paths) this.found = { q, paths, value: searchPaths(paths, q, RESULT_LIMIT) };
    return this.found.value;
  }

  openResult(cx) {
    const r = this.results()?.results[this.at];
    if (r) this.show(r.path, cx);
  }

  clearSearch() {
    this.search.set_value("");
    this.query = ""; this.at = 0;
  }

  // Open with…: stops the press and click so the row neither drags, opens nor toggles.
  openButton(path, dir, t) {
    return div().id(`open-${path}`).w(20).h(20).flex_none().flex().items_center().justify_center().rounded(5)
      .text_color(t.dim).hover(s => s.bg(t.selected).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "chiikawa-files-open", kind: "popup", width: 200, height: 136, props: { path: this.absolute(path), dir } });
      })
      .child("⋯");
  }

  // Absolute path as the terminal should see it (backslashes on local Windows).
  absolute(path) {
    const p = join(this.root, path);
    const win = this.on ? winMachine.get(this.on) : window()?.platform === "windows";
    return win ? p.replace(/\//g, "\\") : p;
  }

  // The pointer left the panel while a row was held: hand the drag to a full-window layer
  // (mods/chiikawa-files-drag) that follows the pointer and pastes the path only on release.
  // ponytail: mods can't start a real OS drag; the overlay stands in for the drop target.
  dropOut() {
    const drag = this.drag; this.drag = null;
    if (!drag || window()?.platform !== "windows") return;
    const panel = this.origin && this.size ? { ...this.origin, width: this.size.width, height: this.size.height } : null;
    openOverlay({ mod: "chiikawa-files-drag", kind: "window", frame: "none", width: 1, height: 1, at: { x: 0, y: 0 },
      props: { ...drag, panel } });
  }

  // Writes only if the file on disk still matches what was opened (writeTextFile's `expected`).
  save(cx) {
    if (!this.dirty || !this.code || this.saving) return;
    const path = this.file, full = join(this.root, path), base = this.base, on = this.on;
    let text = LF(this.code.value());
    if (base.includes("\r\n")) text = text.replace(/\n/g, "\r\n"); // keep Windows line endings
    this.saving = true; this.notice = null; cx.notify();
    cx.spawn(async cx => {
      try {
        if (on) {
          // ponytail: check-then-write, so an edit landing between the two can be overwritten;
          // local saves don't have this gap (writeTextFile checks and writes at once).
          if (await readTextFile(full, { on }) !== base) throw new Error("changed");
          await upload(on, full, text);
          if (await readTextFile(full, { on }) !== text) throw new Error("verify");
        } else await writeTextFile(full, text, base);
        if (this.file === path) { this.base = text; this.dirty = false; }
        notify({ title: "저장했어요", body: on ? `${on}: ${path}` : path, level: "success", timeout: 2000 });
      } catch (e) {
        if (this.file !== path) return;
        // A rejected save is a conflict when the disk moved away from what was opened, else a real failure.
        const disk = await readTextFile(full, { on }).catch(() => undefined);
        if (String(e?.message) !== "verify" && disk !== undefined && disk !== base) this.conflict = true;
        else this.notice = String(e?.message) === "verify"
          ? "저장 확인 실패: 원격 파일 내용이 저장한 것과 달라요. ←로 닫고 다시 열어 확인하세요."
          : `저장 실패: 파일을 쓸 수 없어요${on ? " (원격 연결 확인)" : ""}.`;
      } finally { this.saving = false; cx.notify(); }
    });
  }

  // After a folder change: an unedited open file follows the disk; an edited one that diverged shows the
  // conflict bar. (Disk-sync idea and rules from ssenu/Herdr-UI's my-files.)
  async syncFile(context, cx) {
    const path = this.file, code = this.code, base = this.base;
    if (!path || !code || this.saving) return;
    let disk;
    try { disk = await readTextFile(join(context.cwd, path), { on: context.on }); } catch { return; }
    if (!this.current(context) || this.file !== path || this.code !== code || this.base !== base || this.saving) return;
    if (disk !== null && disk.includes("\0")) return;
    if (disk === base) { this.conflict = false; return; }
    if (this.dirty && disk !== null && LF(code.value()) === LF(disk)) { this.base = disk; this.dirty = false; this.conflict = false; return; } // disk caught up with my edits
    if (this.dirty) { this.conflict = true; return; }
    if (disk === null) { this.show(path, cx); return; } // gone: show() reports it
    if (disk.length > 400000) { this.show(path, cx); return; } // now too big to edit: reopen read-only
    this.base = disk; this.code.set_value(disk); this.rev++;
  }

  // Conflict bar: keep my edits, taking what's on disk now as the expected snapshot.
  overwrite(cx) {
    const path = this.file, full = join(this.root, path), on = this.on;
    cx.spawn(async cx => {
      const disk = await readTextFile(full, { on }).catch(() => undefined);
      if (this.file !== path || disk === undefined) return;
      this.base = disk ?? ""; this.conflict = false; this.dirty = true;
      this.save(cx);
    });
  }

  // Conflict bar: throw my edits away and take the disk.
  loadDisk(cx) {
    const path = this.file, full = join(this.root, path), on = this.on;
    cx.spawn(async cx => {
      const disk = await readTextFile(full, { on }).catch(() => undefined);
      if (this.file !== path || disk === undefined) return;
      if (disk === null || disk.length > 400000) { this.dirty = false; this.show(path, cx); cx.notify(); return; }
      this.base = disk; this.code?.set_value(disk); this.dirty = false; this.conflict = false; this.rev++;
      cx.notify();
    });
  }

  // ← with unsaved edits asks once: the second press discards.
  back(cx) {
    if (this.dirty && !this.discarding) { this.discarding = true; this.notice = "저장 안 한 변경이 있어요. ←를 한 번 더 누르면 버려요."; cx.notify(); return; }
    this.show(null); if (this.query.trim()) this.search.focus(); cx.notify();
  }

  // "Files" title: back to the focused terminal's folder, tree view. Unsaved edits ask once first.
  home(cx) {
    if (this.dirty && !this.discarding) { this.discarding = true; this.notice = "저장 안 한 변경이 있어요. Files를 한 번 더 누르면 버려요."; cx.notify(); return; }
    this.dirty = false; this.browse = null; this.saved.clear(); this.context = null; this.show(null);
    this.refresh(cx); cx.notify();
  }

  // Header path: show it in the system file manager (the open file selected, else the folder).
  reveal(cx) {
    if (!this.root) return;
    if (this.on) { notify({ title: "원격 폴더는 파일 탐색기로 열 수 없어요", body: `${this.on}: ${this.file ?? this.root}`, level: "info", timeout: 2500 }); return; }
    const p = this.absolute(this.file ?? ""), platform = window()?.platform;
    const [cmd, args] = platform === "windows" ? ["explorer", this.file ? [`/select,${p}`] : [p]]
      : platform === "macos" ? ["open", this.file ? ["-R", p] : [p]]
      : ["xdg-open", [this.file ? p.slice(0, p.lastIndexOf("/")) || "/" : p]];
    // explorer.exe exits 1 even when it worked, so the result isn't checked; only a failure to start is reported.
    cx.spawn(async () => { await exec(cmd, args).catch(e => notify({ title: "파일 탐색기를 열지 못했어요", body: String(e), level: "error", timeout: 3000 })); });
  }

  up(cx) {
    const p = this.root && parent(this.root);
    if (!p) return;
    this.browse = p; this.refresh(cx); cx.notify();
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try {
        while (this.context === context) {
          await watchFolder(root);
          const index = this.indexes.get(context.key);
          if (index) index.stale = true; // the next keystroke rebuilds the search list
          if (this.current(context)) this.refresh(cx);
        }
      }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key(this.browse) === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(join(root, path), on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(this.browse), next = key(this.browse);
    if (this.dirty && next !== this.context?.key) return; // never drop unsaved edits on a focus change
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      const known = this.indexes.get(next);
      if (known && !on) known.stale = true; // unwatched while away
      if (saved?.file) this.show(saved.file, cx);
      this.ensureIndex(cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        await this.syncFile(context, cx);
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    this.base = null; this.dirty = false; this.editable = false; this.notice = null; this.discarding = false;
    this.conflict = false; this.rev = 0; this.view = isMarkdown(path) ? "preview" : "edit";
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(join(root, path), { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        // Editable only when shown whole: a truncated view can't be saved. Remote files save through upload().
        this.editable = text.length <= 400000;
        this.base = text;
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: !this.editable,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
        if (this.editable) this.code.on("change", (_e, cx) => {
          this.rev++; // markdown preview re-renders from the edited text
          const dirty = LF(this.code.value()) !== LF(this.base);
          if (dirty !== this.dirty) { this.dirty = dirty; this.discarding = false; cx.notify(); }
        });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_mouse_down("left", () => { this.drag = { path: this.absolute(path), name: entry.name, dir: entry.dir }; })
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .child(entry.dir ? svg(`mods/chiikawa-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/chiikawa-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark)))
        .when(!this.on, el => el.child(this.openButton(path, entry.dir, t))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  resultRow(r, i, t) {
    const path = r.path, { dir, name } = splitPath(path), start = path.length - name.length;
    const mark = this.marks[`${this.root}/${path}`];
    const nameHits = r.hits.filter(h => h >= start).map(h => h - start);
    return h_flex().id(`found-${path}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7).cursor_pointer()
      .when(i === this.at, el => el.bg(t.selected))
      .hover(s => s.bg(t.hover))
      .on_mouse_down("left", () => { this.drag = { path: this.absolute(path), name, dir: false }; })
      .on_click((_e, cx) => { this.at = i; this.show(path, cx); cx.notify(); })
      .child(svg("mods/chiikawa-files/file.svg").size(14).flex_none().text_color(t.muted))
      .child(h_flex().min_w(0).flex_shrink(1).overflow_hidden()
        .children(segments(name, nameHits).map(s => div().when(s.hit, el => el.text_color(t.accent).font_semibold()).child(s.text.replaceAll(" ", " ")))))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(dir))
      .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark)))
      .when(!this.on, el => el.child(this.openButton(path, false, t)));
  }

  searchBar(t) {
    const index = this.index();
    return h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .on_key_down((e, cx) => {
        const n = this.results()?.results.length ?? 0;
        if (e.key === "down" && n) this.at = Math.min(this.at + 1, n - 1);
        else if (e.key === "up" && n) this.at = Math.max(this.at - 1, 0);
        else if (e.key === "escape" && this.query) this.clearSearch();
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(svg("mods/chiikawa-files/search.svg").size(14).flex_none().text_color(t.dim))
      .child(Input.new(this.search).flex_1().h_full().text_size(12.5).text_color(t.foreground))
      .when(Boolean(index?.building), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child("목록 만드는 중…")));
  }

  foundView(t) {
    const index = this.index(), found = this.results(), q = this.query.trim();
    const note = text => div().p(8).text_size(12).text_color(t.dim).child(text);
    if (found && this.at >= found.results.length) this.at = Math.max(0, found.results.length - 1);
    return v_flex().id("files-found").flex_1().min_h(0).overflow_y_scrollbar().p(6)
      .when(Boolean(index?.error), el => el.child(div().p(8).text_size(12).text_color(t.ansi1).child(`파일 목록을 만들지 못했어요: ${index.error}`)))
      .when(Boolean(index?.truncated), el => el.child(note("파일이 너무 많아 처음 50,000개에서만 찾아요")))
      .children(found ? found.results.map((r, i) => this.resultRow(r, i, t)) : [])
      .when(Boolean(found?.more), el => el.child(note("더 있어요 · 검색어를 더 입력하세요")))
      .when(Boolean(found) && found.results.length === 0, el => el.child(note(`‘${q}’와 맞는 파일이 없어요`)))
      .when(!found && !index?.error && !this.context?.cwd, el => el.child(note("No folder")))
      .when(!found && !index?.error && Boolean(this.context?.cwd) && Boolean(index?.building), el => el.child(note("목록 만드는 중…")));
  }

  render(cx) {
    motionTick(this, cx);
    this.syncQuery(cx);
    if (key(this.browse) !== this.context?.key) this.refresh(cx);
    const t = theme(), canUp = !this.file && Boolean(this.root && parent(this.root));
    const bar = () => h_flex().h(34).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).text_size(12);
    const button = (id, label, onClick) => h_flex().id(id).h(24).px(8).flex_none().items_center().rounded(6).cursor_pointer()
      .text_size(12).text_color(t.foreground).border_1().border_color(t.border).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { onClick(cx); cx.notify(); }).child(label);
    const chip = (id, label, on, onClick) => h_flex().id(id).h(24).px(9).flex_none().items_center().rounded(6).cursor_pointer().text_size(12)
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted)
      .hover(s => s.bg(t.hover)).on_click((_e, cx) => { onClick(cx); cx.notify(); }).child(label);
    return v_flex().id("files").size_full().min_h(0).rounded(14).overflow_hidden().bg(t.surface) /* the glass is drawn here, not by the layout, so it fades with the content */.border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .relative().left(this.enter ? 0 : 22).opacity(this.enter ? 1 : 0)
      .spring("left", { response: 320, damping: 1 }).transition("opacity", { duration: 220, easing: "ease-out" })
      .on_mouse_up("left", () => { this.drag = null; })
      // Window-relative panel box (origin = pointer minus its in-panel offset): the drag layer cancels drops back on it.
      .on_mouse_move(e => { if (e.local_position) this.origin = { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y }; })
      .on_size_change(size => { this.size = size; })
      .on_hover(hovered => { if (!hovered) this.dropOut(); })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => this.back(cx)).child("←")))
        .child(div().id("files-home").font_semibold().cursor_pointer().rounded(5).px(4).hover(s => s.bg(t.hover))
          .on_click((_e, cx) => this.home(cx)).child("Files"))
        .when(!this.file && Boolean(this.desktop), el => el.child(chip("files-desktop", "바탕화면", this.browse === this.desktop, cx => this.toggleDesktop(cx))))
        .child(h_flex().flex_1().min_w(0).justify_end()
          .child(div().id("files-path").min_w(0).truncate().text_size(12).text_color(t.dim).rounded(5).px(4).cursor_pointer()
            .hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => this.reveal(cx)).child(this.file ?? this.root ?? "")))
        .when(Boolean(this.file) && this.editable && !this.dirty, el => el.child(div().text_size(11).text_color(t.dim).child("편집 가능")))
        .when(Boolean(this.file) && !this.editable && Boolean(this.code), el => el.child(div().text_size(11).text_color(t.dim).child("읽기 전용")))
        .when(this.dirty, el => el.child(h_flex().id("files-save").h(24).px(10).flex_none().items_center().rounded(6).cursor_pointer()
          .bg(t.accent).text_color(t.accent_foreground).text_size(12).font_semibold()
          .on_click((_e, cx) => this.save(cx))
          .child(this.saving ? "저장 중…" : "● 저장"))))
      .when(Boolean(this.notice), el => el.child(div().px(14).py(6).flex_none().text_size(12).text_color(t.blocked).border_b(1).border_color(t.border).child(this.notice)))
      .when(Boolean(this.file) && this.conflict, el => el.child(bar()
        .child(div().flex_1().min_w(0).truncate().text_color(t.blocked).child("디스크의 파일이 바뀌었어요"))
        .child(button("files-overwrite", "내 것으로 덮어쓰기", cx => this.overwrite(cx)))
        .child(button("files-load", "디스크 버전 불러오기", cx => this.loadDisk(cx)))))
      .when(Boolean(this.file && this.code) && isMarkdown(this.file), el => el.child(bar()
        .child(div().flex_1())
        .child(chip("files-view-preview", "보기", this.view === "preview", () => { this.view = "preview"; }))
        .child(chip("files-view-edit", "편집", this.view === "edit", () => { this.view = "edit"; }))))
      .when(!this.file, el => el.child(this.searchBar(t)))
      .when(!this.file && Boolean(this.query.trim()), el => el.child(this.foundView(t)))
      .when(!this.file && !this.query.trim(), el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6)
        .when(canUp, el => el.child(h_flex().id("file-up").h(28).flex_none().pl(8).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
          .on_click((_e, cx) => this.up(cx))
          .child(div().w(12).flex_none())
          .child(svg("mods/chiikawa-files/folder.svg").size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(".."))))
        .children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(!this.code
        ? div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")
        : this.view === "preview"
          ? v_flex().id("files-preview").flex_1().min_h(0).overflow_y_scrollbar().p(14)
            .child(this.code.value().trim() ? TextView.markdown(`files-md-${this.rev}`, this.code.value()).selectable(true) : div().text_color(t.dim).child("빈 문서"))
          : Editor.new(this.code).flex_1().min_h(0)));
  }
}
