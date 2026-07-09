import type { Plugin } from 'vite';

/**
 * Reown AppKit wui-icon maps many icons to @phosphor-icons/webcomponents.
 * When wui-icon uses size="inherit", getPhosphorSize[this.size] is undefined and Lit
 * binds size="" on the phosphor element → SVG width="" / height="" console errors.
 * Presentation-only; does not touch wallet/connect/swap logic.
 */
const WUI_ICON_SUFFIX = '@reown/appkit-ui/dist/esm/src/components/wui-icon/index.js';

const PHOSPHOR_SIZE_BLOCK =
  /const getPhosphorSize = \{\s*xxs: '0\.5em',\s*xs: '0\.75em',\s*sm: '0\.75em',\s*md: '1em',\s*mdl: '1\.25em',\s*lg: '1\.25em',\s*xl: '1\.5em',\s*xxl: '1\.75em'\s*\};\s*return html `<\$\{tag\} size=\$\{getPhosphorSize\[this\.size\]\} weight="\$\{this\.weight\}"><\/\$\{tag\}>`;/;

const PHOSPHOR_SIZE_REPLACEMENT = `const getPhosphorSize = {
                xxs: '0.5em',
                xs: '0.75em',
                sm: '0.75em',
                md: '1em',
                mdl: '1.25em',
                lg: '1.25em',
                xl: '1.5em',
                xxl: '1.75em',
                inherit: '100%'
            };
            const phosphorSize = getPhosphorSize[this.size];
            return phosphorSize
                ? html \`<\${tag} size=\${phosphorSize} weight="\${this.weight}"></\${tag}>\`
                : html \`<\${tag} weight="\${this.weight}"></\${tag}>\`;`;

export function patchReownWuiIconPhosphorSize(): Plugin {
  return {
    name: 'patch-reown-wui-icon-phosphor-size',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.split('\\').join('/');
      if (!normalized.endsWith(WUI_ICON_SUFFIX)) {
        return null;
      }
      if (!PHOSPHOR_SIZE_BLOCK.test(code)) {
        this.warn(
          '[patch-reown-wui-icon-phosphor-size] wui-icon source changed; verify phosphor size binding manually.',
        );
        return null;
      }
      return {
        code: code.replace(PHOSPHOR_SIZE_BLOCK, PHOSPHOR_SIZE_REPLACEMENT),
        map: null,
      };
    },
  };
}
