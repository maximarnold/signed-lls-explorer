"use strict";

const EXAMPLE="[1;2,-1,2,1,-1,3,-1,3]", BLUE="#216f98", AMBER="#ad641f", INK="#1c3343";
const NS="http://www.w3.org/2000/svg", W=760, H=620, $=id=>document.getElementById(id);
const subscript=n=>String(n).replace(/\d/g,d=>"₀₁₂₃₄₅₆₇₈₉"[Number(d)]), pointName=i=>"A"+subscript(i);
const copyPoints=points=>points.map(p=>[p[0],p[1]]), defaultView=()=>({cx:0,cy:0,scale:66});
let state={points:[],analysis:null,source:"canonical",canonicalSequence:null,view:defaultView()}, history=[], drag=null, mode="move", draft=false, pointListDraft=false, dual=null, combination=null, tikz="";

function fmt(n){if(!Number.isFinite(n))return "undefined";if(n===0)return "0";return Number.isSafeInteger(n)?String(n):Number(n.toPrecision(10)).toString();}
function exact(n){return Object.is(n,-0)?"0":String(n);}
function sequenceText(a){return "["+a.map(exact).join(", ").replace(", ","; ")+"]";}
function parseNumber(text){return LLSPointInput.parseNumber(text);}
function parseSequence(text){
  let s=text.trim().replace(/−/g,"-").replace(/\s*\/\s*/g,"/");
  if(s.startsWith("[")&&s.endsWith("]"))s=s.slice(1,-1).trim();
  if(!s)throw new Error("Enter an odd-length sequence, for example [1;2,-1,2,1,-1,3,-1,3].");
  let a;try{a=s.split(/[\s,;:]+/).map(parseNumber);}catch{throw new Error("Use numbers or fractions separated by commas, semicolons, colons, or spaces, with optional square brackets.");}
  if(a.length%2===0)throw new Error("Use an odd number of terms: an edge term, then alternating angle and edge terms.");
  if(a.some((n,i)=>i%2===0&&n===0))throw new Error("Edge terms a₀, a₂, … must be nonzero. A zero angle term is allowed.");
  return a;
}
function el(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
function svgText(x,y,text,attrs={}){return el("text",{x,y,...attrs},text);}
function niceStep(value){const e=Math.floor(Math.log10(value)),p=10**e,f=value/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p;}
function X(x){return W/2+(x-state.view.cx)*state.view.scale;}
function Y(y){return H/2-(y-state.view.cy)*state.view.scale;}
function snapshot(){return {points:copyPoints(state.points),source:state.source,canonicalSequence:state.canonicalSequence?[...state.canonicalSequence]:null,view:{...state.view},mode};}
function saveUndo(value=snapshot()){history.push(value);if(history.length>60)history.shift();$("undo").disabled=false;}
function fitView(){
  if(!state.points.length){state.view=defaultView();return;}
  const xs=[0,...state.points.map(p=>p[0])],ys=[0,...state.points.map(p=>p[1])];
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),spanX=maxX-minX,spanY=maxY-minY,extent=Math.max(spanX,spanY,1);
  if(!Number.isFinite(extent)){state.view=defaultView();return;}
  const margin=extent*.17,scale=Math.min((W-130)/(spanX+2*margin),(H-130)/(spanY+2*margin));
  if(Number.isFinite(scale)&&scale>0)state.view={cx:minX/2+maxX/2,cy:minY/2+maxY/2,scale};
}
function clearSequenceError(){$("error-message").hidden=true;$("sequence").removeAttribute("aria-invalid");draft=false;}
function clearCoordinateError(){$("coordinate-error").hidden=true;}
function clearPointListError(){$("point-list-error").hidden=true;$("point-list").removeAttribute("aria-invalid");}
function renderPointList(){
  if(pointListDraft){$("point-list-status").textContent="Coordinate list draft — choose Draw from coordinates to apply it.";return;}
  $("point-list").value=state.points.length?"["+state.points.map(p=>"["+p.map(exact).join(", ")+"]").join(", ")+"]":"";
  clearPointListError();
  $("point-list-status").textContent=state.points.length?`${state.points.length} ${state.points.length===1?"vertex":"vertices"} from the current line. Edit this list, then choose Draw from coordinates.`:"No vertices yet. Enter at least two coordinate pairs.";
}
function invalidateTikz(reason="The line changed. Generate TikZ again."){const had=!!tikz;tikz="";$("tikz-output").value="";$("tikz-result").hidden=true;$("tikz-status").textContent=had?reason:"Generate code when the line is ready.";}
function invalidateCombination(){const had=!!combination;combination=null;$("combination-output").value="";$("combination-result").hidden=true;$("combination-warnings").replaceChildren();$("combination-warnings").hidden=true;$("combination-status").textContent=had?"The line changed. Choose a concatenation to draw it again.":"Both actions use the current plotted LLS. Undo restores the previous line.";}
function invalidateOutputs(){const had=!!dual;dual=null;$("dual-output").value="";$("dual-result").hidden=true;$("dual-status").textContent=had?"The line changed. Compute its dual again.":"Compute the dual of the current sequence.";invalidateCombination();invalidateTikz();}
function analyze(){state.analysis=LLSMath.analyzeVertices(state.points);}
function currentSequence(){return state.source==="canonical"&&state.canonicalSequence?state.canonicalSequence:state.analysis&&state.analysis.sequence||[];}
function validSequence(){const a=currentSequence();return state.points.length>=2&&a.length>0&&a.every((n,i)=>Number.isFinite(n)&&(i%2!==0||n!==0))&&state.analysis&&state.analysis.valid;}
function syncSequenceInput(){clearSequenceError();if(validSequence()){$("sequence").value=sequenceText(currentSequence());$("sequence").placeholder="Signed LLS sequence";}else{$("sequence").value="";$("sequence").placeholder=state.points.length<2?"Add at least two vertices":"LLS undefined for this geometry";}}
function setPoints(points,{source="edited",canonicalSequence=null,fit=false,undo=true}={}){if(undo)saveUndo();state.points=copyPoints(points);state.source=source;state.canonicalSequence=canonicalSequence?[...canonicalSequence]:null;if(fit)fitView();invalidateOutputs();clearCoordinateError();analyze();syncSequenceInput();render();}
function showSequenceError(error){draft=true;$("error-message").textContent=error.message+" The plotted vertices have not changed.";$("error-message").hidden=false;$("sequence").setAttribute("aria-invalid","true");renderStatus();}
function canonicalPoints(a){
  const points=signedLLSToVertices(a),analysis=LLSMath.analyzeVertices(points);
  if(!analysis.valid||a.some((value,i)=>value!==0&&analysis.sequence[i]===0))throw new RangeError("These coefficients lose too much numerical precision to draw accurately. Try smaller or less extreme coefficients.");
  return points;
}
function drawFromInput({undo=true}={}){try{const a=parseSequence($("sequence").value);setPoints(canonicalPoints(a),{source:"canonical",canonicalSequence:a,fit:true,undo});}catch(error){showSequenceError(error);}}
function drawFromPointList(){
  try{const points=LLSPointInput.parsePoints($("point-list").value);pointListDraft=false;setPoints(points,{source:"edited",fit:true});}
  catch(error){pointListDraft=true;$("point-list-error").textContent=error.message+" This coordinate list was not applied.";$("point-list-error").hidden=false;$("point-list").setAttribute("aria-invalid","true");renderPointList();}
}
function renderStatus(){
  $("source-status").textContent=draft?"Input draft — choose Draw from LLS to replace the current line.":state.points.length<2?"Add at least two vertices to compute a signed LLS.":!validSequence()?"Current coordinates preserved · some LLS terms are undefined.":state.source==="canonical"?"Canonical construction · A₀ = (1, 0), A₁ = (1, a₀)":"Edited coordinates · signed LLS recomputed from the current vertices";
}
function renderSummary(){
  const a=currentSequence();$("counts").replaceChildren();
  [[a.length,"terms"],[Math.max(0,state.points.length-1),"edges"],[state.points.length,"vertices"]].forEach(([n,label])=>{const span=document.createElement("span"),strong=document.createElement("strong");strong.textContent=n;span.append(strong," "+label);$("counts").append(span);});
  renderStatus();$("sequence-terms").replaceChildren();
  a.forEach((n,i)=>{const d=document.createElement("div");d.className="term"+(i%2?" angle":"")+(Number.isFinite(n)?"":" undefined");d.title=i%2?"Signed angle term at "+pointName((i+1)/2):"Signed edge term "+pointName(i/2)+" → "+pointName(i/2+1);const small=document.createElement("small"),strong=document.createElement("strong");small.textContent="a"+subscript(i);strong.textContent=fmt(n);d.append(small,strong);$("sequence-terms").append(d);});
  const diagnostics=$("geometry-diagnostics");diagnostics.replaceChildren();
  const messages=[...new Set((state.analysis&&state.analysis.issues||[]).map(x=>x.message).filter(Boolean))];
  if(state.points.length>=3&&state.analysis.valid&&!state.analysis.nondegenerate&&!messages.length)messages.push("A straight angle gives a zero odd-indexed term. The coordinates and finite LLS are retained.");
  messages.forEach(message=>{const p=document.createElement("p");p.textContent=message;diagnostics.append(p);});diagnostics.hidden=!messages.length;
  const note=passageText(state.points);$("passage-note").textContent=note;$("passage-note").hidden=!note;
  $("precision-note").hidden=!state.points.some(p=>p.some(n=>Number.isInteger(n)&&!Number.isSafeInteger(n)));$("precision-note").textContent="Some coordinates exceed JavaScript’s safe integer range and may be approximate.";
  $("compute-dual").disabled=!validSequence();$("draw-combination").disabled=!validSequence();$("draw-reversed-combination").disabled=!validSequence();$("generate-tikz").disabled=state.points.length<2;$("copy").disabled=!state.points.length;$("undo").disabled=!history.length;
}
function coordinateError(message){$("coordinate-error").textContent=message;$("coordinate-error").hidden=false;}
function renderTable(){
  $("vertices").replaceChildren();$("no-vertices").hidden=state.points.length>0;
  state.points.forEach((p,i)=>{
    const row=document.createElement("tr"),name=document.createElement("td");name.textContent=pointName(i);row.append(name);
    const inputs=p.map((n,axis)=>{const td=document.createElement("td"),input=document.createElement("input");input.type="text";input.inputMode="decimal";input.className="coordinate-input";input.value=exact(n);input.autocomplete="off";input.setAttribute("aria-label",pointName(i)+" "+(axis===0?"x":"y")+" coordinate");input.dataset.vertex=i;input.dataset.axis=axis;td.append(input);row.append(td);return input;});
    function commit(axis,restoreFocus){
      try{const next=inputs.map(input=>parseNumber(input.value));if(next[0]===state.points[i][0]&&next[1]===state.points[i][1]){clearCoordinateError();return;}const points=copyPoints(state.points);points[i]=next;setPoints(points,{fit:true});if(restoreFocus){const input=$("vertices").querySelector(`[data-vertex="${i}"][data-axis="${axis}"]`);if(input){input.focus();if(typeof input.select==="function")input.select();}}}
      catch(error){coordinateError(pointName(i)+": "+error.message);inputs[axis].setAttribute("aria-invalid","true");}
    }
    inputs.forEach((input,axis)=>{input.addEventListener("change",()=>commit(axis,false));input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();commit(axis,true);}});});
    const cell=document.createElement("td"),remove=document.createElement("button");remove.type="button";remove.className="remove-point";remove.textContent="×";remove.setAttribute("aria-label","Remove "+pointName(i));remove.addEventListener("click",()=>{const points=copyPoints(state.points);points.splice(i,1);setPoints(points);});cell.append(remove);row.append(cell);$("vertices").append(row);
  });
}
function llsTag(group,x,y,text,color){if(!Number.isFinite(x)||!Number.isFinite(y))return;const width=Math.max(49,text.length*7+13),g=el("g",{class:"lls-tag"});g.append(el("rect",{x:x-width/2,y:y-13,width,height:24,rx:5,fill:"white",stroke:color,"stroke-opacity":.17}));g.append(svgText(x,y+4,text,{fill:color,"text-anchor":"middle"}));group.append(g);}

function drawPlot(){
  const points=state.points,a=currentSequence(),svg=$("plot"),{cx,cy,scale}=state.view;
  const left=cx-(W/2-24)/scale,right=cx+(W/2-24)/scale,bottom=cy-(H/2-24)/scale,top=cy+(H/2-24)/scale;
  svg.replaceChildren();svg.classList.toggle("add-mode",mode==="add");
  svg.append(el("title",{id:"plot-title"},"Editable directed broken line"));
  svg.append(el("desc",{id:"plot-description"},points.length?`${points.length} vertices in order: ${points.map((p,i)=>pointName(i)+" = ("+p.map(exact).join(", ")+")").join("; ")}. Edit coordinates in the adjacent table or drag points. The origin is fixed.`:"An empty coordinate plane. Choose Add vertices and click the plane, or use the coordinate form."));
  const defs=el("defs"),arrow=el("marker",{id:"direction-arrow",viewBox:"0 0 10 10",refX:8,refY:5,markerWidth:5,markerHeight:5,orient:"auto-start-reverse"});arrow.append(el("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:BLUE}));defs.append(arrow);
  const clip=el("clipPath",{id:"plot-clip"});clip.append(el("rect",{x:10,y:10,width:W-20,height:H-20}));defs.append(clip);svg.append(defs);
  const grid=el("g",{"pointer-events":"none"}),axes=el("g",{"pointer-events":"none"}),lines=el("g",{"pointer-events":"none","clip-path":"url(#plot-clip)"}),labels=el("g",{"pointer-events":"none"}),dots=el("g");
  const step=niceStep(65/scale);
  if(Number.isFinite(step)&&step>0){
    for(let j=0,x=Math.ceil(left/step)*step;x<=right&&j<100;j++,x+=step){if($("lattice").checked)grid.append(el("line",{x1:X(x),y1:24,x2:X(x),y2:H-24,stroke:"#edf1f1","stroke-width":1}));if(Math.abs(x)>step*1e-8)grid.append(svgText(X(x),Math.min(H-12,Math.max(36,Y(0)+20)),fmt(x),{class:"tick","text-anchor":"middle"}));}
    for(let j=0,y=Math.ceil(bottom/step)*step;y<=top&&j<100;j++,y+=step){if($("lattice").checked)grid.append(el("line",{x1:24,y1:Y(y),x2:W-24,y2:Y(y),stroke:"#edf1f1","stroke-width":1}));if(Math.abs(y)>step*1e-8)grid.append(svgText(Math.min(W-15,Math.max(20,X(0)-12)),Y(y)+4,fmt(y),{class:"tick","text-anchor":"end"}));}
  }
  const latticeCount=(Math.floor(right)-Math.ceil(left)+1)*(Math.floor(top)-Math.ceil(bottom)+1);$("scale-note").textContent="";
  if($("lattice").checked&&latticeCount>0&&latticeCount<=2200&&scale>=6&&Math.max(Math.abs(left),Math.abs(right),Math.abs(top),Math.abs(bottom))<Number.MAX_SAFE_INTEGER){for(let x=Math.ceil(left);x<=Math.floor(right);x++)for(let y=Math.ceil(bottom);y<=Math.floor(top);y++)grid.append(el("circle",{cx:X(x),cy:Y(y),r:1.8,fill:"#cdd9de"}));}
  else if($("lattice").checked)$("scale-note").textContent="Lattice dots hidden at this scale";
  if(Y(0)>=20&&Y(0)<=H-20){axes.append(el("line",{x1:24,y1:Y(0),x2:W-24,y2:Y(0),stroke:"#b4c1c7","stroke-width":1.1}));axes.append(svgText(W-24,Y(0)-10,"x",{class:"axis-label"}));}
  if(X(0)>=20&&X(0)<=W-20){axes.append(el("line",{x1:X(0),y1:24,x2:X(0),y2:H-24,stroke:"#b4c1c7","stroke-width":1.1}));axes.append(svgText(X(0)+10,28,"y",{class:"axis-label"}));}
  const isDefault=points.length===6&&points.every((p,i)=>p[0]===[1,1,-1,-1,2,-1][i]&&p[1]===[0,1,-2,-3,3,0][i]);
  for(let k=0;k<points.length-1;k++){
    const p=points[k],q=points[k+1],xp=X(p[0]),yp=Y(p[1]),xq=X(q[0]),yq=Y(q[1]);if(![xp,yp,xq,yq].every(Number.isFinite))continue;
    const actualEdge=state.analysis&&state.analysis.edges[k],bad=!Number.isFinite(actualEdge)||actualEdge===0;
    lines.append(el("line",{x1:xp,y1:yp,x2:xq,y2:yq,stroke:bad?"#b96947":BLUE,"stroke-width":3,"stroke-linecap":"round",...(bad?{"stroke-dasharray":"6 4"}:{})}));
    const arrowT=isDefault&&k===3?.23:.53;
    if(Math.hypot(xq-xp,yq-yp)>2)lines.append(el("line",{x1:xp+(xq-xp)*(arrowT-.07),y1:yp+(yq-yp)*(arrowT-.07),x2:xp+(xq-xp)*arrowT,y2:yp+(yq-yp)*arrowT,stroke:BLUE,"stroke-width":3,"marker-end":"url(#direction-arrow)"}));
    if(isDefault&&k===3)lines.append(el("line",{x1:xp+(xq-xp)*.78,y1:yp+(yq-yp)*.78,x2:xp+(xq-xp)*.84,y2:yp+(yq-yp)*.84,stroke:BLUE,"stroke-width":3,"marker-end":"url(#direction-arrow)"}));
    if($("labels").checked){const length=Math.hypot(xq-xp,yq-yp)||1;let tx=(xp+xq)/2-(yq-yp)/length*25,ty=(yp+yq)/2+(xq-xp)/length*25;if(isDefault){const positions=[[1.65,.35],[-.67,-.60],[-1.65,-2.5],[.4,-1.35],[.1,1.7]];tx=X(positions[k][0]);ty=Y(positions[k][1]);}llsTag(labels,tx,ty,"a"+subscript(2*k)+" = "+fmt(a[2*k]),BLUE);}
  }
  axes.append(el("circle",{cx:X(0),cy:Y(0),r:3.6,fill:INK}));axes.append(svgText(X(0)-13,Y(0)-11,"O",{class:"vertex-label",fill:INK,"text-anchor":"end"}));
  points.forEach((p,k)=>{
    const px=X(p[0]),py=Y(p[1]);if(!Number.isFinite(px)||!Number.isFinite(py))return;
    const hit=el("circle",{cx:px,cy:py,r:13,fill:"transparent","data-point-index":k,class:"vertex-hit"});hit.append(el("title",{},`Move ${pointName(k)} (${p.map(exact).join(", ")})`));dots.append(hit);
    dots.append(el("circle",{cx:px,cy:py,r:5,fill:INK,stroke:"white","stroke-width":1.5,"data-point-index":k,class:"vertex-dot"}));
    if($("point-labels").checked&&($("even-point-labels").checked||k%2===1)){const offsets=isDefault?[[12,25],[14,-15],[-30,-10],[-30,25],[10,-15],[-31,-12]]:null,offset=offsets?offsets[k]:[11,k%2?-13:23];dots.append(svgText(px+offset[0],py+offset[1],pointName(k),{class:"vertex-label point-label",fill:INK,"pointer-events":"none"}));}
    if($("labels").checked&&k>0&&k<points.length-1){let tx=px+46,ty=py+27;if(isDefault){const positions=[[1.72,1],[-.2,-2.24],[-.25,-3.32],[2.6,2.72]];tx=X(positions[k-1][0]);ty=Y(positions[k-1][1]);}llsTag(labels,tx,ty,"a"+subscript(2*k-1)+" = "+fmt(a[2*k-1]),AMBER);}
  });
  if(!points.length)labels.append(svgText(W/2,H/2-55,"Click to place the first vertex",{fill:"#71848e","text-anchor":"middle","font-size":16}));
  svg.append(grid,axes,lines,labels,dots);
}
function passageText(points){
  for(let i=0;i<points.length-1;i++){const p=points[i],q=points[i+1],vx=q[0]-p[0],vy=q[1]-p[1],len2=vx*vx+vy*vy;if(!Number.isFinite(len2)||len2===0)continue;for(let j=0;j<points.length;j++){if(j===i||j===i+1)continue;const ux=points[j][0]-p[0],uy=points[j][1]-p[1],t=(ux*vx+uy*vy)/len2;if(t>1e-9&&t<1-1e-9&&Math.abs(ux*vy-uy*vx)<=1e-12*Math.max(len2,Math.abs(ux*vy),Math.abs(uy*vx)))return `${pointName(i)} → ${pointName(i+1)} passes through ${pointName(j)}. On this passage, continue straight along the arrow.`;}}
  return "";
}
function render(){renderSummary();renderTable();drawPlot();renderPointList();}
function setMode(next){mode=next;document.querySelectorAll('input[name="edit-mode"]').forEach(input=>{input.checked=input.value===mode;});$("mode-help").textContent=mode==="add"?"Click the plot to append a vertex. Points are joined in the order you add them.":"Drag a vertex to move it. You can also edit its coordinates in the table.";$("plot").classList.toggle("add-mode",mode==="add");}
function pointerCoordinates(event){
  const svg=$("plot"),matrix=svg.getScreenCTM();if(!matrix)return null;
  const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const local=p.matrixTransform(matrix.inverse());
  let x=state.view.cx+(local.x-W/2)/state.view.scale,y=state.view.cy-(local.y-H/2)/state.view.scale;
  if($("snap").checked){x=Math.round(x);y=Math.round(y);}return Number.isFinite(x)&&Number.isFinite(y)?[x===0?0:x,y===0?0:y]:null;
}
$("plot").addEventListener("pointerdown",event=>{
  if(event.button!==0||drag)return;const p=pointerCoordinates(event);if(!p)return;
  if(mode==="add"){event.preventDefault();setPoints([...state.points,p]);return;}
  const target=event.target.closest&&event.target.closest("[data-point-index]");if(!target)return;const index=Number(target.dataset.pointIndex);if(!state.points[index])return;
  event.preventDefault();drag={index,pointerId:event.pointerId,before:snapshot(),saved:false};$("plot").setPointerCapture(event.pointerId);$("plot").classList.add("dragging");
});
$("plot").addEventListener("pointermove",event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;const p=pointerCoordinates(event);if(!p)return;const old=state.points[drag.index];if(old[0]===p[0]&&old[1]===p[1])return;
  event.preventDefault();if(!drag.saved){saveUndo(drag.before);drag.saved=true;}state.points[drag.index]=p;state.source="edited";state.canonicalSequence=null;invalidateOutputs();clearCoordinateError();analyze();syncSequenceInput();render();
});
function endDrag(event,cancel){if(!drag||event.pointerId!==drag.pointerId)return;const old=drag;drag=null;$("plot").classList.remove("dragging");if($("plot").hasPointerCapture(event.pointerId))$("plot").releasePointerCapture(event.pointerId);if(cancel&&old.saved){history.pop();state.points=copyPoints(old.before.points);state.source=old.before.source;state.canonicalSequence=old.before.canonicalSequence?[...old.before.canonicalSequence]:null;state.view={...old.before.view};analyze();syncSequenceInput();render();}}
$("plot").addEventListener("pointerup",event=>endDrag(event,false));$("plot").addEventListener("pointercancel",event=>endDrag(event,true));
$("sequence-form").addEventListener("submit",event=>{event.preventDefault();drawFromInput();});
$("sequence").addEventListener("input",()=>{draft=true;$("error-message").hidden=true;$("sequence").removeAttribute("aria-invalid");renderStatus();});
$("point-list-form").addEventListener("submit",event=>{event.preventDefault();drawFromPointList();});
$("point-list").addEventListener("input",()=>{pointListDraft=true;clearPointListError();renderPointList();});
$("use-current-points").addEventListener("click",()=>{pointListDraft=false;renderPointList();});
$("reset").addEventListener("click",()=>{$("sequence").value=EXAMPLE;drawFromInput();setMode("move");});
$("fit").addEventListener("click",()=>{fitView();drawPlot();});
$("new-line").addEventListener("click",()=>{saveUndo();state.view=defaultView();setMode("add");setPoints([],{undo:false});});
$("undo").addEventListener("click",()=>{if(!history.length||drag)return;const old=history.pop();state.points=copyPoints(old.points);state.source=old.source;state.canonicalSequence=old.canonicalSequence?[...old.canonicalSequence]:null;state.view={...old.view};setMode(old.mode);invalidateOutputs();clearCoordinateError();analyze();syncSequenceInput();render();});
document.querySelectorAll('input[name="edit-mode"]').forEach(input=>input.addEventListener("change",()=>{if(input.checked)setMode(input.value);}));
$("append-form").addEventListener("submit",event=>{event.preventDefault();try{const p=[parseNumber($("append-x").value),parseNumber($("append-y").value)];setPoints([...state.points,p],{fit:true});$("append-x").value="";$("append-y").value="";$("append-x").focus();}catch(error){coordinateError(error.message);}});
for(const id of ["labels","point-labels","even-point-labels","lattice"]){$(id).addEventListener("change",()=>{$("even-point-labels").disabled=!$("point-labels").checked;invalidateTikz("Display options changed. Generate TikZ again.");drawPlot();});}
async function copyText(text,button,label){
  try{await navigator.clipboard.writeText(text);$("manual-copy").hidden=true;button.textContent="Copied";}
  catch{const field=$("manual-copy-text");field.value=text;$("manual-copy").hidden=false;button.textContent="Copy manually";if(typeof $("manual-copy").scrollIntoView==="function")$("manual-copy").scrollIntoView({block:"nearest"});field.focus();if(typeof field.select==="function")field.select();}
  setTimeout(()=>{button.textContent=label;},1800);
}
$("close-manual-copy").addEventListener("click",()=>{$("manual-copy").hidden=true;});
$("copy").addEventListener("click",()=>copyText(JSON.stringify(state.points,null,2),$("copy"),"Copy"));
$("compute-dual").addEventListener("click",()=>{
  if(!validSequence())return;
  try{dual=LLSMath.adjacencyDual([...currentSequence()]);$("dual-output").value=sequenceText(dual.sequence);$("dual-result").hidden=false;$("dual-status").textContent=dual.domain==="positive-integer"?"Adjacent-angle dual · positive integer domain":"Formal extension · real elements";
    const warnings=$("dual-warnings");warnings.replaceChildren();const list=Array.isArray(dual.warnings)?dual.warnings:[];list.forEach(text=>{const p=document.createElement("p");p.textContent=text;warnings.append(p);});warnings.hidden=!list.length;$("draw-dual").disabled=!dual.canDraw;$("copy-dual").textContent="Copy sequence";
  }catch(error){dual=null;$("dual-result").hidden=true;$("dual-status").textContent=error.message;}
});
$("draw-dual").addEventListener("click",()=>{if(!dual||!dual.canDraw)return;try{const sequence=[...dual.sequence];setPoints(canonicalPoints(sequence),{source:"canonical",canonicalSequence:sequence,fit:true});}catch(error){$("dual-status").textContent=error.message;}});
$("copy-dual").addEventListener("click",()=>{if(dual)copyText(sequenceText(dual.sequence),$("copy-dual"),"Copy sequence");});
function showCombination(result,message){
  combination=result;$("combination-output").value=sequenceText(result.sequence);$("combination-result").hidden=false;$("combination-status").textContent=message;$("copy-combination").textContent="Copy combination";
  const warnings=$("combination-warnings");warnings.replaceChildren();result.warnings.forEach(text=>{const p=document.createElement("p");p.textContent=text;warnings.append(p);});warnings.hidden=!result.warnings.length;
}
function drawCombination(reverseDual=false){
  if(!validSequence())return;
  let result=null;
  try{
    const a=[...currentSequence()],b=LLSMath.adjacencyDual(a),tail=reverseDual?[...b.sequence].reverse():b.sequence,sequence=[...a,-1,...tail];
    result={sequence,warnings:[...b.warnings]};
    if(!b.canDraw)throw new RangeError("The dual has a zero edge term, so the combination cannot be drawn.");
    const points=canonicalPoints(sequence);
    setPoints(points,{source:"canonical",canonicalSequence:sequence,fit:true});
    showCombination(result,`${reverseDual?"LLS + reversed dual drawn":"Combined line drawn"} · ${sequence.length} terms · ${points.length-1} edges · ${points.length} vertices. Undo restores the previous line.`);
  }catch(error){
    const message=error.message+" The plotted vertices have not changed.";
    if(result)showCombination(result,message);else{invalidateCombination();$("combination-status").textContent=message;}
  }
}
$("draw-combination").addEventListener("click",()=>drawCombination());
$("draw-reversed-combination").addEventListener("click",()=>drawCombination(true));
$("copy-combination").addEventListener("click",()=>{if(combination)copyText(sequenceText(combination.sequence),$("copy-combination"),"Copy combination");});
$("generate-tikz").addEventListener("click",()=>{
  if(state.points.length<2)return;
  try{tikz=LLSTikZ.toTikz(copyPoints(state.points),currentSequence(),{showLabels:$("labels").checked,showPointLabels:$("point-labels").checked,showEvenPointLabels:$("even-point-labels").checked,showGrid:$("lattice").checked});$("tikz-output").value=tikz;$("tikz-result").hidden=false;$("tikz-status").textContent="Generated from the current coordinates and display options.";$("copy-tikz").textContent="Copy code";}
  catch(error){tikz="";$("tikz-result").hidden=true;$("tikz-status").textContent=error.message;}
});
$("copy-tikz").addEventListener("click",()=>{if(tikz)copyText(tikz,$("copy-tikz"),"Copy code");});
$("download-tikz").addEventListener("click",()=>{if(!tikz)return;const url=URL.createObjectURL(new Blob([tikz],{type:"application/x-tex;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="lls_broken_line.tex";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
drawFromInput({undo:false});
