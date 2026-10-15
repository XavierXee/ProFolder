import "react";

// This project's installed @types/react version predates React's/TypeScript DOM lib's official
// typing for the standard `inert` HTML attribute (it's been a real, broadly-supported browser
// attribute since well before this was written). Augment it here rather than upgrading
// @types/react, so JSX can use `inert` on any element — e.g. the always-mounted-but-CSS-hidden
// slide-in panels (FileDetailPanel, ProjectDetailPanel, BatchEditPanel, ScanFolderPanel,
// SettingsPanel, CreateCustomTabModal) set `inert` while visually hidden, which excludes their
// entire subtree from focus, pointer interaction, and the accessibility tree in one attribute —
// the fix for those panels' controls being silently reachable "ghost" Tab stops while closed.
//
// Typed as `string`, not `boolean`: this installed React version (18.3) doesn't recognize
// `inert` as a real boolean attribute (it isn't in React's hardcoded boolean-attribute list),
// so `inert={true}`/`inert={false}` both get silently dropped from the DOM entirely (with a
// dev-mode console warning) rather than toggling the attribute's presence — confirmed empirically
// against this exact React version. Only a string value actually renders the attribute; pass
// `inert={closedCondition ? "" : undefined}` at each call site (`undefined` omits the attribute
// the same way `false` would for a real boolean prop).
declare module "react" {
  interface HTMLAttributes<T> {
    inert?: string;
  }
}
