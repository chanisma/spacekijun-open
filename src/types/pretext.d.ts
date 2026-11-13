declare module 'pretext' {
  /** Full block-level renderer: produces <p>, <ul>, <h1>, etc. */
  function pretext(text: string): string;

  namespace pretext {
    /** Inline-only renderer: bold, italic, code, links. No block elements. */
    function text(input: string): string;
    function italicize(input: string): string;
    function boldify(input: string): string;
    function codify(input: string): string;
    function linkify(input: string): string;
    function dashify(input: string): string;
    function escape(input: string): string;
  }

  export = pretext;
}
