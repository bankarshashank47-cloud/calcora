(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const display = $('#display'), expressionPreview = $('#expressionPreview'), resultPreview = $('#resultPreview'), errorBox = $('#error');
  const historyList = $('#historyList');
  const STORAGE = 'calcora-history-v1', THEME = 'calcora-theme-v1';
  let expression = '', justEvaluated = false, memory = 0, history = [], undoStack = [], redoStack = [];

  const isOperator = c => '+-*/'.includes(c);
  const cleanNumber = n => {
    if (!Number.isFinite(n)) throw new Error('Result is outside the safe numeric range.');
    if (Object.is(n, -0)) n = 0;
    const abs = Math.abs(n);
    if ((abs !== 0 && abs < 1e-10) || abs >= 1e15) return n.toExponential(10).replace(/\.?(\d*?)0+e/, '$1e').replace('e+', 'e');
    return Number(n.toPrecision(15)).toString();
  };
  const formatDisplay = s => {
    if (!s) return '0';
    return s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/\b/g, '');
  };
  function tokenize(s) {
    const out = [], re = /\s*(?:(\d*\.?\d+(?:e[+-]?\d+)?)|([()+\-*/]))/gi; let i = 0, m;
    while (i < s.length) {
      re.lastIndex = i; m = re.exec(s);
      if (!m || m.index !== i) throw new Error('Invalid expression.');
      if (m[1]) out.push({type:'number', value:Number(m[1])}); else out.push({type:'op', value:m[2]});
      i = re.lastIndex;
    }
    return out;
  }
  function evaluate(s) {
    if (!s) throw new Error('Enter a calculation first.');
    const t = tokenize(s); let p = 0;
    function primary() {
      if (t[p]?.type === 'op' && t[p].value === '-') { p++; return -primary(); }
      if (t[p]?.type === 'op' && t[p].value === '+') { p++; return primary(); }
      if (t[p]?.value === '(') { p++; const v = addSub(); if (t[p]?.value !== ')') throw new Error('Missing closing parenthesis.'); p++; return v; }
      if (t[p]?.type !== 'number' || !Number.isFinite(t[p].value)) throw new Error('Invalid number.');
      return t[p++].value;
    }
    function mulDiv() { let v = primary(); while (t[p]?.type === 'op' && ('*/'.includes(t[p].value))) { const op=t[p++].value, r=primary(); if(op==='/'&&r===0) throw new Error('Cannot divide by zero.'); v=op==='*'?v*r:v/r; if(!Number.isFinite(v)) throw new Error('Result is outside the safe numeric range.'); } return v; }
    function addSub() { let v = mulDiv(); while (t[p]?.type === 'op' && ('+-'.includes(t[p].value))) { const op=t[p++].value, r=mulDiv(); v=op==='+'?v+r:v-r; if(!Number.isFinite(v)) throw new Error('Result is outside the safe numeric range.'); } return v; }
    const result = addSub(); if (p !== t.length) throw new Error('Invalid expression.'); return result;
  }
  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = !msg; }
  function snapshot() { return expression; }
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack=[]; }
  function render() {
    display.textContent = formatDisplay(expression) || '0';
    expressionPreview.textContent = expression ? 'Expression' : '';
    resultPreview.textContent = '';
    showError('');
    if (expression) { try { resultPreview.textContent = '≈ ' + cleanNumber(evaluate(expression)); } catch (_) {} }
  }
  function setExpression(v) { expression=v; render(); }
  function append(v) {
    showError('');
    if (justEvaluated && !isOperator(v) && v !== ')') { pushUndo(); expression=''; }
    justEvaluated=false;
    if (/^\d$/.test(v)) {
      pushUndoOnce(); expression += v;
    } else if (v === '.') {
      const tail = expression.split(/[+\-*/()]/).pop(); if (tail.includes('.')) return; pushUndoOnce(); expression += tail ? '.' : '0.';
    } else if (isOperator(v)) {
      if (!expression && v !== '-') { return; }
      if (/[+\-*/]$/.test(expression)) { pushUndoOnce(); expression=expression.slice(0,-1)+v; } else { pushUndoOnce(); expression+=v; }
    } else if (v==='(') {
      pushUndoOnce(); if (/\d|\)$/.test(expression.slice(-1))) expression+='*'; expression+='(';
    } else if (v===')') {
      if (!expression || /[+\-*/(]$/.test(expression)) return; pushUndoOnce(); expression+=')';
    }
    render();
  }
  let lastUndoExpression = null;
  function pushUndoOnce(){ if(lastUndoExpression!==expression){ pushUndo(); lastUndoExpression=expression; setTimeout(()=>{lastUndoExpression=null},0); } }
  function calculate() {
    try { const old=expression; const result=cleanNumber(evaluate(expression)); addHistory(old,result); pushUndo(); expression=result; justEvaluated=true; render(); } catch(e) { showError(e.message); }
  }
  function backspace(){ if(!expression)return; pushUndo(); expression=expression.slice(0,-1); justEvaluated=false; render(); }
  function clear(){ if(expression){pushUndo();expression='';} justEvaluated=false; render(); }
  function clearAll(){ pushUndo(); expression=''; memory=0; justEvaluated=false; render(); }
  function toggleSign(){
    if(!expression)return; pushUndo();
    const m=expression.match(/(\d*\.?\d+(?:e[+-]?\d+)?)$/i); if(!m)return;
    const start=m.index; const before=expression.slice(0,start); const num=m[0]; expression=before+(num.startsWith('-')?num.slice(1):'-'+num); render();
  }
  function percentage(){
    if(!expression)return; const m=expression.match(/(\d*\.?\d+(?:e[+-]?\d+)?)$/i); if(!m)return; pushUndo(); const n=Number(m[0]); expression=expression.slice(0,m.index)+cleanNumber(n/100); render();
  }
  function currentValue(){ try{return evaluate(expression||'0')}catch(_){return 0} }
  function memoryAction(a){ const v=currentValue(); if(a==='memory-add')memory+=v; if(a==='memory-subtract')memory-=v; if(a==='memory-recall'){pushUndo();expression=cleanNumber(memory);justEvaluated=true;render();} if(a==='memory-clear')memory=0; }
  function addHistory(expr,result){ history.unshift({id:Date.now()+Math.random(),expr,result}); history=history.slice(0,50); saveHistory(); renderHistory(); }
  function saveHistory(){ try{localStorage.setItem(STORAGE,JSON.stringify(history));}catch(_){} }
  function loadHistory(){ try{const h=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(h))history=h.slice(0,50);}catch(_){history=[]} renderHistory(); }
  function renderHistory(){ if(!history.length){historyList.innerHTML='<p class="empty-state">Your calculations will appear here.</p>';return;} historyList.innerHTML=''; history.forEach(item=>{const row=document.createElement('div');row.className='history-item';const use=document.createElement('button');use.className='history-use';use.type='button';use.innerHTML='<span class="history-expression"></span><span class="history-result"></span>';use.querySelector('.history-expression').textContent=item.expr.replace(/\*/g,'×').replace(/\//g,'÷');use.querySelector('.history-result').textContent=item.result;use.addEventListener('click',()=>{pushUndo();expression=item.result;justEvaluated=true;render()});const del=document.createElement('button');del.className='history-delete';del.type='button';del.setAttribute('aria-label','Delete calculation');del.textContent='×';del.addEventListener('click',()=>{history=history.filter(x=>x.id!==item.id);saveHistory();renderHistory()});row.append(use,del);historyList.append(row);}); }
  function undo(){if(!undoStack.length)return;redoStack.push(expression);expression=undoStack.pop();justEvaluated=false;render()}
  function redo(){if(!redoStack.length)return;undoStack.push(expression);expression=redoStack.pop();justEvaluated=false;render()}
  async function copy(text){try{await navigator.clipboard.writeText(text);resultPreview.textContent='Copied';setTimeout(render,900)}catch(_){showError('Copy is unavailable in this browser.')}}
  function share(){const url=new URL(location.href); if(expression)url.hash='calc='+encodeURIComponent(expression); if(navigator.share)navigator.share({title:'Calcora',text:expression?expression+' = '+(cleanNumber(evaluate(expression))):'Calcora calculator',url:url.toString()}).catch(()=>{});else copy(url.toString())}
  document.querySelectorAll('[data-value]').forEach(b=>b.addEventListener('click',()=>append(b.dataset.value)));
  document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.action;({ 'clear-all':clearAll,'clear':clear,'backspace':backspace,'toggle-sign':toggleSign,'percentage':percentage,'equals':calculate,'undo':undo,'redo':redo,'copy-result':()=>copy(cleanNumber(currentValue())),'share':share,'memory-add':()=>memoryAction('memory-add'),'memory-subtract':()=>memoryAction('memory-subtract'),'memory-recall':()=>memoryAction('memory-recall'),'memory-clear':()=>memoryAction('memory-clear') }[a]||(()=>{}))()}));
  $('#clearHistory').addEventListener('click',()=>{history=[];saveHistory();renderHistory()});
  document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key;if(/^\d$/.test(k)||['+','-','*','/','(',')','.'].includes(k)){e.preventDefault();append(k)}else if(k==='Enter'||k==='='){e.preventDefault();calculate()}else if(k==='Backspace'){e.preventDefault();backspace()}else if(k==='Escape'){e.preventDefault();clear()}else if(k==='%'){e.preventDefault();percentage()}});
  $('#themeToggle').addEventListener('click',()=>{document.body.classList.toggle('dark');const dark=document.body.classList.contains('dark');$('#themeToggle').textContent=dark?'☀':'☾';$('#themeToggle').setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');try{localStorage.setItem(THEME,dark?'dark':'light')}catch(_){} });
  try{if(localStorage.getItem(THEME)==='dark'){$('#themeToggle').click()}}catch(_){}
  $('#year').textContent=new Date().getFullYear(); loadHistory();
  if(location.hash.startsWith('#calc=')){try{const v=decodeURIComponent(location.hash.slice(6));if(v&&v.length<500){evaluate(v);expression=v;render()}}catch(_) {}}
})();
