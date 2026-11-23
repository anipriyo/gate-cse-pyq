// Scientific calculator in the spirit of the GATE virtual calculator.
// Uses its own expression parser (no eval).

const FUNCS = {
  sin: (x, d) => Math.sin(d ? (x * Math.PI) / 180 : x),
  cos: (x, d) => Math.cos(d ? (x * Math.PI) / 180 : x),
  tan: (x, d) => Math.tan(d ? (x * Math.PI) / 180 : x),
  asin: (x, d) => (d ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
  acos: (x, d) => (d ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
  atan: (x, d) => (d ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  log: Math.log10, ln: Math.log, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, exp: Math.exp, abs: Math.abs,
};

function fact(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evaluate(src, deg = true) {
  const toks = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/π/g, "pi").replace(/−/g, "-").match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+\d?|[-+*/^()!%,]/gi) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  function primary() {
    const t = next();
    if (t === undefined) throw new Error("incomplete");
    if (t === "(") { const v = expr(); if (next() !== ")") throw new Error(")"); return v; }
    if (t === "-") return -power();
    if (t === "+") return power();
    if (/^\d|^\./.test(t)) return parseFloat(t);
    const name = t.toLowerCase();
    if (name === "pi") return Math.PI;
    if (name === "e") return Math.E;
    if (FUNCS[name]) {
      let arg;
      if (peek() === "(") { next(); arg = expr(); if (next() !== ")") throw new Error(")"); } else arg = power();
      return FUNCS[name](arg, deg);
    }
    throw new Error("bad token " + t);
  }
  function postfix() {
    let v = primary();
    while (peek() === "!" || peek() === "%") v = next() === "!" ? fact(v) : v / 100;
    return v;
  }
  function power() {
    const b = postfix();
    if (peek() === "^") { next(); return Math.pow(b, unary()); }
    return b;
  }
  function unary() {
    if (peek() === "-") { next(); return -unary(); }
    if (peek() === "+") { next(); return unary(); }
    return power();
  }
  function term() {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t === "*") { next(); v *= unary(); }
      else if (t === "/") { next(); v /= unary(); }
      else if (t && (t === "(" || /^[a-z\d.]/i.test(t))) v *= unary(); // implicit multiply: 2pi, 3(4)
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      const t = peek();
      if (t === "+") { next(); v += term(); }
      else if (t === "-") { next(); v -= term(); }
      else return v;
    }
  }
  const v = expr();
  if (i < toks.length) throw new Error("unexpected " + toks[i]);
  return v;
}

const fmt = (v) => (Number.isFinite(v) ? String(Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(12)) : "Error");

let open = null;
export function toggleCalculator() {
  if (open) { open.remove(); open = null; return; }
  const el = document.createElement("div");
  el.className = "calc";
  el.style.left = Math.max(8, window.innerWidth - 350) + "px";
  el.style.top = "90px";
  const keys = [
    ["sin", "cos", "tan", "(", ")", "C"],
    ["asin", "acos", "atan", "x²", "x^y", "⌫"],
    ["sinh", "cosh", "tanh", "√", "∛", "n!"],
    ["log", "ln", "eˣ", "7", "8", "9"],
    ["π", "e", "1/x", "4", "5", "6"],
    ["mod", "%", "÷", "1", "2", "3"],
    ["Ans", "×", "−", "+", "0", "."],
    ["±", "M+", "MR", "MC", "=", "="],
  ];
  el.innerHTML = `<div class="calc-head"><b>Scientific Calculator</b><button aria-label="Close">×</button></div>
    <div class="calc-disp"><div class="calc-expr"></div><div class="calc-val">0</div></div>
    <div class="calc-mode"><label><input type="radio" name="cm" value="deg" checked> Deg</label><label><input type="radio" name="cm" value="rad"> Rad</label><span style="margin-left:auto;color:#666" class="mem"></span></div>
    <div class="calc-keys">${keys.flat().map((k, idx) => (k === "=" && keys.flat()[idx - 1] === "=" ? "" : `<button data-k="${k}" class="${/^[\d.]$/.test(k) ? "" : k === "=" ? "eq" : k === "C" || k === "⌫" ? "clr" : "op"}" ${k === "=" ? 'style="grid-column:span 2"' : ""}>${k}</button>`)).join("")}</div>`;
  document.body.append(el);
  open = el;
  let expr = "", ans = 0, mem = 0, justEval = false;
  const ex = el.querySelector(".calc-expr"), val = el.querySelector(".calc-val"), memEl = el.querySelector(".mem");
  const deg = () => el.querySelector('input[name=cm]:checked').value === "deg";
  const show = () => { ex.textContent = expr; memEl.textContent = mem ? "M" : ""; };
  const ins = (s) => { if (justEval && /^[\d.(πea-z√∛]/.test(s)) expr = ""; justEval = false; expr += s; show(); };
  el.querySelector(".calc-keys").addEventListener("click", (e) => {
    const k = e.target.dataset?.k;
    if (!k) return;
    const map = { "x²": "^2", "x^y": "^", "√": "sqrt(", "∛": "cbrt(", "n!": "!", "eˣ": "exp(", "1/x": "1/(", "π": "π", "÷": "÷", "×": "×", "−": "−" };
    if (k === "C") { expr = ""; val.textContent = "0"; show(); return; }
    if (k === "⌫") { expr = expr.slice(0, -1); show(); return; }
    if (k === "=") {
      // a mod b -> a - b*floor(a/b)
      const m = expr.split("mod");
      try {
        const v = m.length === 2 ? ((a, b) => a - b * Math.floor(a / b))(evaluate(m[0].replace(/Ans/g, "(" + ans + ")"), deg()), evaluate(m[1].replace(/Ans/g, "(" + ans + ")"), deg())) : evaluate(expr.replace(/Ans/g, "(" + ans + ")"), deg());
        ans = v; val.textContent = fmt(v);
      } catch { val.textContent = "Error"; }
      justEval = true; ex.textContent = expr + " ="; return;
    }
    if (k === "±") { expr = expr ? "-(" + expr + ")" : "-"; show(); return; }
    if (k === "M+") { const v = parseFloat(val.textContent); if (!isNaN(v)) mem += v; show(); return; }
    if (k === "MR") { ins(String(mem)); return; }
    if (k === "MC") { mem = 0; show(); return; }
    if (k === "mod") { ins(" mod "); return; }
    if (["sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "log", "ln"].includes(k)) { ins(k + "("); return; }
    if (justEval && /^[+\-−×÷^%!]/.test(map[k] ?? k)) { expr = "Ans"; justEval = false; }
    ins(map[k] ?? k);
  });
  el.querySelector(".calc-head button").onclick = () => { el.remove(); open = null; };
  // drag
  const head = el.querySelector(".calc-head");
  head.addEventListener("pointerdown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
    const mv = (ev) => { el.style.left = Math.min(window.innerWidth - 60, Math.max(0, ev.clientX - sx)) + "px"; el.style.top = Math.min(window.innerHeight - 40, Math.max(0, ev.clientY - sy)) + "px"; };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  });
}
export function closeCalculator() { if (open) { open.remove(); open = null; } }
