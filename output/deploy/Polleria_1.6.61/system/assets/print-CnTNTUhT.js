import{a as e,d as t,g as n,n as r,p as i,r as a}from"./format-BFQZFH9V.js";import{Gt as o,H as s,Ht as c,I as l,K as u,U as d}from"./app-20261121c-DVCkLeAx.js";import{t as f}from"./staffLabel-B1ZcVUju.js";import{g as p,h as m,i as h,n as g,o as _,p as v,r as y,s as b,t as x}from"./share-DZVbGHXj.js";function S(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`)}function C(e,t,n=`80mm`){return`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${S(e)}</title>
  <style>
    @page { size: ${n} auto; margin: 4mm; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 12px; }
    .sheet { width: 72mm; margin: 0 auto; padding: 12px 0 24px; }
    .center { text-align: center; }
    .brand { font-size: 16px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .logo { display: block; width: 62mm; max-width: 100%; height: auto; margin: 0 auto 6px; background: #fff; }
    img.logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .muted { color: #444; }
    .dash { border: 0; border-top: 1px dashed #111; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 4px 0; }
    .note { font-size: 11px; font-style: italic; }
    .big { font-size: 18px; font-weight: 800; }
    .mesa { font-size: 22px; font-weight: 900; letter-spacing: 0.04em; }
    .cut { text-align: center; font-size: 10px; margin-top: 10px; }
    h1, h2, p { margin: 0 0 4px; }
    @media print { .noprint { display: none !important; } }
  </style>
</head>
<body>
  <div class="sheet">${t}</div>
</body>
</html>`}function w(){return typeof window>`u`?o(`logo-lopez.png`):new URL(o(`logo-lopez.png`),window.location.origin).href}function T(e){let t=(e||``).trim();return!(t.length<4||/^api\s*ok$/i.test(t))}function E(e){let t=(e.ruc||``).replace(/\D/g,``),n=l(),r=[];return t.length>=8&&r.push(`<p class="muted">RUC ${S(e.ruc)}</p>`),n&&r.push(`<p class="muted">Tel. ${S(n)}</p>`),r.push(`<p class="muted">${S(c())}</p>`),r.join(``)}function D(a,o,s){a=i(a,o.igvRate);let c=new Date().toISOString(),l=s===`cocina`?`COMANDA COCINA`:s===`cuenta`?`PRE-CUENTA`:a.docTipo===`factura`?`FACTURA`:a.docTipo&&a.docTipo!==`ninguno`?`BOLETA`:`TICKET DE VENTA`,f=a.items.map(e=>s===`cocina`?`<div class="item"><strong>${e.qty}</strong> ${S(e.name)}${e.notes?`<div class="note">** ${S(e.notes)}</div>`:``}</div>`:`<div class="item"><div class="row"><span>${e.qty} ${S(e.name)}</span><span>${S(n(e.qty*e.price))}</span></div>${e.notes?`<div class="note">${S(e.notes)}</div>`:``}</div>`).join(``),p=a.docTipo===`factura`,m=s===`cocina`?``:`<hr class="dash" />
        ${p?`<div class="row muted"><span>Op. gravadas</span><span>${S(n(a.subtotal))}</span></div>`:``}
        ${a.discount?`<div class="row muted"><span>Descuento</span><span>- ${S(n(a.discount))}</span></div>`:``}
        ${p?`<div class="row muted"><span>IGV ${(o.igvRate*100).toFixed(0)}% (incluido)</span><span>${S(n(a.igv))}</span></div>`:``}
        <div class="row big"><span>TOTAL</span><span>${S(n(a.total))}</span></div>
        <p class="center muted" style="margin-top:8px">${S(d[a.paymentMethod])} · ${a.paid?`PAGADO`:`POR COBRAR`}</p>`,h=s!==`cocina`&&(a.docTipo===`factura`||a.docTipo===`boleta_dni`||a.docTipo===`boleta_simple`)?`<p>${a.docTipo===`factura`&&a.docNumero?`RUC ${S(a.docNumero)}`:a.docTipo===`boleta_dni`&&a.docNumero?`DNI ${S(a.docNumero)}`:``}</p>
        ${a.docNombre?`<p><strong>${S(a.docNombre)}</strong></p>`:``}
        ${a.docAddress?`<p>${S(a.docAddress)}</p>`:``}`:``,g=a.tableNumber?`<p class="center mesa">MESA ${S(String(a.tableNumber))}</p>`:a.type===`salon`?`<p class="center mesa">SALON</p>`:`<p class="center big">${S(a.type===`llevar`?`RECOJO`:`DELIVERY`)}</p>`,_=`
    <div class="center">
      <img class="logo" src="${S(w())}" alt="${S(o.name)}" />
      ${T(o.slogan)?`<p class="muted">${S(o.slogan)}</p>`:``}
      <p class="muted">${S(o.address)}</p>
      ${E(o)}
    </div>
    <hr class="dash" />
    <p class="center big">${l}</p>
    <p class="center">${S(t(a.number))} · ${S(r(c))}</p>
    <p class="center"><strong>Hora ${S(e(c))}</strong></p>
    ${g}
    <p class="center"><strong>${S(u[a.type])}</strong></p>
    <p><strong>Cliente: ${S(a.customerName||`—`)}</strong></p>
    ${a.customerPhone&&a.customerPhone!==`0`?`<p>Cel: ${S(a.customerPhone)}</p>`:``}
    ${a.address?`<p>${S(a.address)}</p>`:``}
    <p><strong>Mozo: ${S(a.createdBy||`—`)}</strong></p>
    ${h}
    <hr class="dash" />
    ${f}
    ${a.notes?`<p class="note">Nota: ${S(a.notes)}</p>`:``}
    ${m}
    <hr class="dash" />
    <p class="center muted">${s===`cocina`?`Preparar con receta de la casa`:`Gracias por su visita`}</p>
    <p class="cut">- - - corte aquí - - -</p>
  `;return C(`${l} ${t(a.number)}`,_)}function O(e){let t=e.rows.map(e=>`<tr>${e.map(e=>`<td>${S(e)}</td>`).join(``)}</tr>`).join(``),n=`
    <h1 style="font-family:Georgia,serif;font-size:22px;margin:0">${S(e.settings.name)}</h1>
    <p>${S(e.settings.address)} · RUC ${S(e.settings.ruc)}</p>
    <h2 style="margin:16px 0 8px">${S(e.title)}</h2>
    <p>Periodo: ${S(e.period)}</p>
    <p><strong>Ventas:</strong> ${S(e.sales)} · <strong>Tickets:</strong> ${S(e.tickets)} · <strong>IGV:</strong> ${S(e.igv)}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:12px">
      <thead>
        <tr>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Nº</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Fecha</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Cliente</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Canal</th>
          <th style="text-align:left;border-bottom:1px solid #111;padding:6px">Pago</th>
          <th style="text-align:right;border-bottom:1px solid #111;padding:6px">Total</th>
        </tr>
      </thead>
      <tbody>${t}</tbody>
    </table>
    <p style="margin-top:24px;font-size:11px;color:#555">Impreso ${S(a(new Date().toISOString()))}</p>
  `;return`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${S(e.title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, sans-serif; color: #111; margin: 0; }
  .report { padding: 16px; }
  td { padding: 6px; border-bottom: 1px solid #ddd; }
  @media print { .noprint { display: none !important; } }
</style></head>
<body>
<div class="report">${n}</div>
</body></html>`}var k=`polleria-print-overlay`,A=`polleria-print-toast`,j=null;function M(){j&&=(document.removeEventListener(`keydown`,j),null),document.getElementById(k)?.remove(),document.documentElement.style.removeProperty(`overflow`),document.body.style.removeProperty(`overflow`)}typeof window<`u`&&(window.closePrintPreview=M);function N(e,t={}){M(),document.getElementById(A)?.remove();let n=document.createElement(`div`);n.id=k,n.setAttribute(`role`,`dialog`),n.setAttribute(`aria-modal`,`true`),n.setAttribute(`aria-label`,`Vista previa de impresión`);let r=t.ticket?`<button type="button" data-share>Compartir</button>`:``;n.innerHTML=`
    <style>
      #${k} {
        position: fixed; inset: 0; z-index: 2147483000;
        display: flex; flex-direction: column;
        background: #111; color: #fff;
      }
      #${k} .polleria-print-bar {
        flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
        padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top));
        background: #0c0c0c; border-bottom: 1px solid rgba(255,255,255,0.12);
      }
      #${k} .polleria-print-bar p {
        margin: 0; flex: 1 1 140px; font: 600 14px/1.3 system-ui, sans-serif;
      }
      #${k} .polleria-print-bar button {
        min-height: 44px; border: 0; border-radius: 12px; padding: 0 16px;
        font: 700 14px system-ui, sans-serif; cursor: pointer;
      }
      #${k} .polleria-print-error {
        flex: 0 0 auto; margin: 0; padding: 10px 14px;
        background: #7a2214; color: #fff; font: 600 13px/1.4 system-ui, sans-serif;
      }
      #${k} [data-close] { background: #fff; color: #111; }
      #${k} [data-print] { background: #1a3d1a; color: #fff; }
      #${k} [data-rawbt] { background: #d1541f; color: #fff; }
      #${k} [data-share] { background: #2f3d55; color: #fff; }
      #${k} iframe { flex: 1 1 auto; width: 100%; border: 0; background: #fff; }
      @media print { #${k} { display: none !important; } }
    </style>
    <div class="polleria-print-bar">
      <p data-status>Vista previa</p>
      ${t.ticket&&p()===`android`?`<button type="button" data-rawbt>Enviar a RawBT</button>`:``}
      ${r}
      <button type="button" data-print>Imprimir</button>
      <button type="button" data-close>Cerrar</button>
    </div>
    ${t.error?`<p class="polleria-print-error">No se pudo imprimir: ${S(t.error)}</p>`:``}
    <iframe title="Documento a imprimir"></iframe>
  `,document.documentElement.style.overflow=`hidden`,document.body.style.overflow=`hidden`,document.body.appendChild(n),j=e=>{e.key===`Escape`&&(e.preventDefault(),M())},document.addEventListener(`keydown`,j);let i=n.querySelector(`iframe`);if(n.querySelectorAll(`[data-close]`).forEach(e=>{e.addEventListener(`click`,()=>M())}),n.querySelectorAll(`[data-print]`).forEach(e=>{e.addEventListener(`click`,()=>i?.contentWindow?.print())}),t.ticket){let e=t.ticket,r=n.querySelector(`[data-status]`),i=x(e);n.querySelectorAll(`[data-share]`).forEach(e=>{e.addEventListener(`click`,async()=>{let e=await g(await i);r&&e===`downloaded`&&(r.textContent=`Ticket descargado`)})}),n.querySelectorAll(`[data-rawbt]`).forEach(n=>{n.addEventListener(`click`,async()=>{r&&(r.textContent=`Enviando a RawBT…`),await v(h(e,t.config??s)),r&&(r.textContent=`Enviado a RawBT`)})})}let a=i?.contentDocument;if(!i||!a){M();return}a.open(),a.write(e),a.close()}function P(e){document.getElementById(A)?.remove();let t=document.createElement(`div`);t.id=A,t.innerHTML=`
    <style>
      #${A} {
        position: fixed; z-index: 2147482000;
        left: 50%; transform: translateX(-50%);
        bottom: max(16px, env(safe-area-inset-bottom));
        display: flex; align-items: center; gap: 12px;
        max-width: calc(100vw - 24px);
        padding: 10px 12px 10px 16px; border-radius: 14px;
        background: #0c0c0c; color: #fff;
        font: 600 13px/1.3 system-ui, sans-serif;
        box-shadow: 0 12px 32px rgba(0,0,0,0.35);
      }
      #${A} button {
        min-height: 36px; border: 0; border-radius: 10px; padding: 0 12px;
        font: 700 13px system-ui, sans-serif; cursor: pointer;
        background: #fff; color: #111;
      }
      @media print { #${A} { display: none !important; } }
    </style>
    <span>Ticket enviado a RawBT</span>
    <button type="button">Ver ticket</button>
  `,document.body.appendChild(t);let n=setTimeout(()=>t.remove(),6e3);t.querySelector(`button`)?.addEventListener(`click`,()=>{clearTimeout(n),t.remove(),e()})}function F(e,t){let n=b()??e.printers??_();return t===`cocina`?n.cocina?.enabled?n.cocina:null:n.caja?.enabled?n.caja:null}async function I(e,t,n,r=[]){let i={...e,createdBy:f(e,r)},a=F(t,n),o=y(i,t,n,a?.cols??48),s=e=>N(D(i,t,n),{ticket:o,config:a??void 0,error:e});if(a&&a.driver!==`browser`){let e=await m(h(o,a),a);if(e.ok){a.driver===`rawbt`&&P(()=>s());return}s(e.error);return}s()}function L(e){N(e)}function R(e){let t=Math.abs(e.difference)<.01?`Cuadra`:e.difference>0?`Sobrante ${n(e.difference)}`:`Faltante ${n(Math.abs(e.difference))}`,r=e.signature?`<img alt="Firma" src="${e.signature}" style="display:block;width:100%;max-height:90px;object-fit:contain;background:#fff" />`:`<div style="height:72px"></div>`,i=e=>Number.isInteger(e)?String(e):e.toFixed(2),o=e=>`<div class="row"><span>${S(e.name)}</span><span>Salió ${i(e.sold)} ${S(e.unit)} · queda ${i(e.left)} ${S(e.unit)}</span></div>`,s=e.cuantificable&&(e.cuantificable.products.length||e.cuantificable.insumos.length)?`<hr class="dash" /><p class="muted">Vendidos (carta)</p>${[...e.cuantificable.products.map(o),...e.cuantificable.insumos.map(o)].join(``)}`:``,c=e.stock&&e.stock.length?`<hr class="dash" /><p class="muted">Stock del turno</p>
         <div class="row"><span></span><span>Había · Salió · Queda</span></div>
         ${e.stock.map(e=>`<div class="row"><span>${S(e.name)}</span><span>${i(e.had)} · ${i(e.out)} · ${i(e.left)} ${S(e.unit)}</span></div>`).join(``)}`:``,l=`
    <p class="center brand">${S(e.settings.name)}</p>
    <p class="center muted">CIERRE DE CAJA / LIQUIDACIÓN</p>
    <hr class="dash" />
    <p>Turno: ${S(a(e.fromAt))}</p>
    <p>Cierre: ${S(a(e.closedAt))}</p>
    <hr class="dash" />
    <div class="row"><span>Pedidos cobrados</span><span>${e.ordersCount}</span></div>
    <div class="row"><span>Ventas</span><span>${n(e.sales)}</span></div>
    <div class="row"><span>Efectivo esperado</span><span>${n(e.efectivo)}</span></div>
    <div class="row"><span>Yape</span><span>${n(e.yape)}</span></div>
    <div class="row"><span>Tarjeta</span><span>${n(e.tarjeta)}</span></div>
    <div class="row"><span>Efectivo contado</span><span>${n(e.counted)}</span></div>
    <p class="big center" style="margin-top:8px">${S(t)}</p>
    ${e.notes?`<p class="note">Nota: ${S(e.notes)}</p>`:``}
    ${c}
    ${s}
    <hr class="dash" />
    <p class="muted">Entrega de efectivo y liquidación</p>
    ${r}
    <p class="center muted" style="margin-top:4px">Firma de quien entrega / recibe</p>
    <p class="cut">- - - corte aquí - - -</p>
  `;return C(`Cierre de caja ${a(e.closedAt)}`,l)}export{O as i,L as n,I as r,R as t};