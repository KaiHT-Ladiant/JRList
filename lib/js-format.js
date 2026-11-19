/**
 * Lightweight JS pretty-printer for recon viewing.
 * Not a full deobfuscator — only spacing / indentation / newlines.
 */
(function (root) {
  "use strict";

  const MAX_INPUT = 1_500_000;
  const MAX_OUTPUT = 2_500_000;

  function isIdent(ch) {
    return /[A-Za-z0-9_$]/.test(ch);
  }

  function beautify(source) {
    if (source == null) return "";
    let src = String(source);
    if (src.length > MAX_INPUT) {
      src = src.slice(0, MAX_INPUT);
    }

    let out = "";
    let indent = 0;
    const tab = "  ";
    let i = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escape = false;
    let prevNonSpace = "";

    const pushIndent = () => {
      out += "\n" + tab.repeat(Math.max(indent, 0));
    };

    const lastOutChar = () => {
      for (let k = out.length - 1; k >= 0; k--) {
        const ch = out[k];
        if (ch !== " " && ch !== "\t") return ch;
      }
      return "";
    };

    while (i < src.length) {
      if (out.length > MAX_OUTPUT) {
        out += "\n/* … truncated */\n";
        break;
      }

      const ch = src[i];
      const next = src[i + 1] || "";

      if (inLineComment) {
        out += ch;
        if (ch === "\n") {
          inLineComment = false;
          out += tab.repeat(Math.max(indent, 0));
        }
        i += 1;
        continue;
      }

      if (inBlockComment) {
        out += ch;
        if (ch === "*" && next === "/") {
          out += "/";
          i += 2;
          inBlockComment = false;
          continue;
        }
        if (ch === "\n") out += tab.repeat(Math.max(indent, 0));
        i += 1;
        continue;
      }

      if (inSingle || inDouble || inTemplate) {
        out += ch;
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (inSingle && ch === "'") {
          inSingle = false;
        } else if (inDouble && ch === '"') {
          inDouble = false;
        } else if (inTemplate && ch === "`") {
          inTemplate = false;
        }
        i += 1;
        continue;
      }

      if (ch === "/" && next === "/") {
        if (prevNonSpace && !"({[=,:;!|&?+-*/%<>~^".includes(prevNonSpace) && isIdent(prevNonSpace)) {
          // could be division; keep as-is
          out += ch;
          prevNonSpace = ch;
          i += 1;
          continue;
        }
        inLineComment = true;
        out += "//";
        i += 2;
        continue;
      }

      if (ch === "/" && next === "*") {
        inBlockComment = true;
        out += "/*";
        i += 2;
        continue;
      }

      if (ch === "'") {
        inSingle = true;
        out += ch;
        prevNonSpace = ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        out += ch;
        prevNonSpace = ch;
        i += 1;
        continue;
      }
      if (ch === "`") {
        inTemplate = true;
        out += ch;
        prevNonSpace = ch;
        i += 1;
        continue;
      }

      if (ch === "{" || ch === "[") {
        out += ch;
        indent += 1;
        pushIndent();
        prevNonSpace = ch;
        i += 1;
        continue;
      }

      if (ch === "}" || ch === "]") {
        indent = Math.max(indent - 1, 0);
        // trim trailing spaces on current line
        out = out.replace(/[ \t]+$/g, "");
        if (lastOutChar() !== "\n") pushIndent();
        else out += tab.repeat(Math.max(indent, 0));
        out += ch;
        prevNonSpace = ch;
        i += 1;
        if (next === "," || next === ";" || next === ")" || next === "]") {
          /* keep tight */
        } else if (next && /[A-Za-z_$]/.test(next)) {
          pushIndent();
        }
        continue;
      }

      if (ch === ";") {
        out += ";";
        prevNonSpace = ch;
        i += 1;
        if (next && next !== "}" && next !== "]" && next !== "\n") pushIndent();
        continue;
      }

      if (ch === ",") {
        out += ",";
        prevNonSpace = ch;
        i += 1;
        if (next === "}" || next === "]") continue;
        out += " ";
        continue;
      }

      if (ch === "\n" || ch === "\r") {
        i += 1;
        continue;
      }

      if (ch === " " || ch === "\t") {
        if (out.endsWith(" ") || out.endsWith("\n") || out.endsWith(tab)) {
          i += 1;
          continue;
        }
        if (prevNonSpace && !"({[".includes(prevNonSpace)) out += " ";
        i += 1;
        continue;
      }

      if ("=+-*/%<>!&|?:".includes(ch)) {
        const last = lastOutChar();
        if (last && last !== "\n" && last !== " " && last !== "(") out += " ";
        out += ch;
        if (next === "=" || (ch === "&" && next === "&") || (ch === "|" && next === "|") || (ch === "=" && next === ">")) {
          out += next;
          i += 2;
          prevNonSpace = next;
          out += " ";
          continue;
        }
        out += " ";
        prevNonSpace = ch;
        i += 1;
        continue;
      }

      out += ch;
      if (ch.trim()) prevNonSpace = ch;
      i += 1;
    }

    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function looksLikeJsUrl(url) {
    const u = String(url || "").split(/[?#]/)[0].toLowerCase();
    return (
      /\.(?:js|mjs|cjs|jsx|ts|tsx)$/i.test(u) ||
      /\/_next\/static\/chunks\//i.test(u) ||
      /\/_nuxt\//i.test(u) ||
      /(?:chunk|bundle|vendor|app)\.js$/i.test(u)
    );
  }

  root.JsFormat = { beautify, looksLikeJsUrl, MAX_INPUT };
})(typeof globalThis !== "undefined" ? globalThis : window);
