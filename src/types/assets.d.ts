declare module '*.sql' {
  /** Raw file contents, inlined at build time by `babel-plugin-inline-import`. */
  const content: string;
  export default content;
}