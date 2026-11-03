// Drag layer for chiikawa-files and chiikawa-github: a transparent full-window overlay opened when a row
// is dragged out of its panel. The label follows the pointer; releasing outside the panel types the text
// into the focused terminal (clipboard + terminal.paste), releasing back over the panel cancels.
// props: text (typed as is) or path (quoted when needed), name, dir, icon, panel (window-relative box).
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, notify } from "herdr";

const inside = (b, p) => b && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
// Plain paths go as is; paths with $ or ` get PowerShell single quotes (no expansion there);
// other special characters get double quotes, which cmd, PowerShell and sh all read.
const quote = p => (/[$`]/.test(p) ? `'${p.replaceAll("'", "''")}'` : /[\s'"&()^%!,;=]/.test(p) ? `"${p}"` : p) + " ";

export default class FilesDrag extends View {
  init() { this.pos = null; this.done = false; }

  finish(position, cx) {
    if (this.done) return;
    this.done = true; cx.notify(); // hides the label at once
    const { text, path, panel, overlay } = props() ?? {};
    const typed = text ?? (path ? quote(path) : null);
    try {
      // ponytail: lands in the focused terminal, not the one under the pointer (panes() has no bounds),
      // and replaces the clipboard. Clipboard via cx.write_to_clipboard (idea from ssenu/Herdr-UI).
      if (typed && position && !inside(panel, position)) {
        cx.write_to_clipboard(typed);
        run("terminal.paste", {});
      }
    } catch (e) {
      notify({ title: "붙여넣지 못했어요", body: String(e), level: "error", timeout: 3000 });
    } finally {
      if (overlay) closeOverlay(overlay);
    }
  }

  render() {
    const t = theme(), { name = "", dir = false, icon } = props() ?? {};
    return div().id("files-drag-layer").size_full().bg("#00000001")
      .on_mouse_move((e, cx) => { if (!this.done) { this.pos = e.position; cx.notify(); } })
      .on_mouse_up("left", (e, cx) => this.finish(e.position, cx))
      // Released before this layer opened: the next press just closes it.
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.finish(null, cx); })
      .when(Boolean(this.pos) && !this.done, el => el.child(
        h_flex().absolute().left(this.pos.x + 14).top(this.pos.y + 12).h(26).px(10).gap(6).items_center()
          .rounded(7).bg(t.popover).border_1().border_color(t.accent).text_color(t.foreground).text_size(12)
          .child(icon ?? (dir ? "📁" : "📄")).child(name)
          .child(div().text_color(t.dim).child("· 놓으면 입력"))));
  }
}
