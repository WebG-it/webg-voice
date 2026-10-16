// Pagine locali di prova per l'inserimento della dettatura.
export const PAGINE = {
  // campo di testo semplice
  input: `<!doctype html><meta charset="utf-8"><title>input</title>
    <input id="campo" type="text" value="" style="width:600px">`,

  // textarea "alla React": il valore passa da un tracciatore come quello di React; l'onChange
  // scatta solo se l'evento input porta un valore diverso da quello tracciato (un setter sul
  // campo, come fa React, non basta: serve execCommand o il setter nativo)
  react: `<!doctype html><meta charset="utf-8"><title>react</title>
    <textarea id="campo" rows="6" cols="80"></textarea><pre id="stato"></pre>
    <script>
      const el = document.getElementById('campo');
      const nativo = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      let tracciato = '';
      Object.defineProperty(el, 'value', {
        configurable: true,
        get() { return nativo.get.call(this); },
        set(v) { tracciato = String(v); nativo.set.call(this, v); },
      });
      window.statoReact = '';
      el.addEventListener('input', () => {
        const v = nativo.get.call(el);
        if (v !== tracciato) { tracciato = v; window.statoReact = v; document.getElementById('stato').textContent = v; }
      });
    </script>`,

  // editor che gestisce da se' il testo (come ProseMirror, Lexical): beforeinput con preventDefault
  gestito: `<!doctype html><meta charset="utf-8"><title>gestito</title>
    <div id="campo" contenteditable="true" style="border:1px solid #999;min-height:80px;width:600px"><p><br></p></div>
    <script>
      const el = document.getElementById('campo');
      window.modello = [''];
      function disegna() {
        el.innerHTML = window.modello.map((r) => '<p>' + (r ? r.replace(/&/g,'&amp;').replace(/</g,'&lt;') : '<br>') + '</p>').join('');
        const ultimo = el.lastChild; const r = document.createRange();
        r.selectNodeContents(ultimo); r.collapse(false);
        if (ultimo.firstChild && ultimo.firstChild.nodeName === 'BR') { r.setStart(ultimo, 0); r.collapse(true); }
        getSelection().removeAllRanges(); getSelection().addRange(r);
      }
      el.addEventListener('beforeinput', (e) => {
        e.preventDefault();
        if (e.inputType === 'insertText') window.modello[window.modello.length - 1] += e.data;
        else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') window.modello.push('');
        else if (e.inputType.startsWith('delete')) { const r = getSelection().getRangeAt(0); const n = r.toString().length || 1; let u = window.modello[window.modello.length - 1]; window.modello[window.modello.length - 1] = u.slice(0, Math.max(0, u.length - n)); }
        disegna();
      });
    </script>`,

  // contenteditable semplice (come la composizione di Gmail)
  modificabile: `<!doctype html><meta charset="utf-8"><title>modificabile</title>
    <div id="campo" contenteditable="true" style="border:1px solid #999;min-height:80px;width:600px"></div>`,

  // campo dentro un riquadro (come TinyMCE in Joomla)
  riquadro: `<!doctype html><meta charset="utf-8"><title>riquadro</title>
    <p>Pagina con riquadro</p><iframe id="rq" src="/riquadro-dentro" style="width:700px;height:200px"></iframe>`,
  'riquadro-dentro': `<!doctype html><meta charset="utf-8"><title>dentro</title>
    <textarea id="campo" rows="5" cols="70"></textarea>`,

  // nessun campo: il testo va nella casella
  nessuno: `<!doctype html><meta charset="utf-8"><title>nessuno</title>
    <p>Solo testo, nessun campo.</p>`,
};
