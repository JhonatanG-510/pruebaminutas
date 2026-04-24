/* ============================================================
   MINUTAS LEGALES — MEJORAS SOLO PARA MÓVIL
   Activa la vista previa en vivo a pantalla completa con chips
   tappables y editor bottom-sheet. NO toca escritorio.
   ============================================================ */
(function () {
  "use strict";

  var MQ = window.matchMedia("(max-width: 768px)");
  function isMobile() { return MQ.matches; }

  /* ---------- Helpers de estado ----------
     Como app.js es un script clásico, sus `let` viven en el
     scope global compartido y los podemos leer/escribir por nombre.
  */
  function safeGet(name) {
    try { return eval(name); } catch (e) { return undefined; }
  }
  function safeSetCampo(name, value) {
    try { eval("camposLlenados[name] = value"); } catch (e) {}
  }
  function safeSetIA(name, value) {
    try {
      eval("camposIALlenados[name] = value; if (camposIAMejorados[name]) delete camposIAMejorados[name];");
    } catch (e) {}
  }
  function safeSetClausula(key, value) {
    try { eval("camposClausulas[key] = value"); } catch (e) {}
  }
  function callActualizar() {
    try { actualizarLivePreview(); } catch (e) {}
  }

  /* ---------- Identificación del placeholder ---------- */
  function classifyPlaceholder(spanEl) {
    var name = spanEl.dataset.ph || "";
    var minuta = safeGet("currentMinuta") || {};
    var camposCortos = (minuta.campos || []).map(String);
    var camposLargos = (minuta.camposLargo || []).map(String);
    var phIA = (safeGet("placeholdersIA") || []).map(String);

    // ¿está dentro de una cláusula opcional?
    var clEl = spanEl.closest && spanEl.closest(".lp-clause");
    var clauseInfo = null;
    if (clEl) {
      var clId = clEl.dataset.clId;
      var minutaCl = (safeGet("minutaClausulas") || []);
      var cl = minutaCl.find(function (c) { return c.id === clId; });
      if (cl && cl.camposExtra && cl.camposExtra.indexOf(name) !== -1) {
        clauseInfo = { id: clId, key: clId + "_" + name, clause: cl };
      }
    }

    if (clauseInfo) {
      var camposCl = safeGet("camposClausulas") || {};
      return {
        type: "clausula",
        name: name,
        currentValue: camposCl[clauseInfo.key] || "",
        clause: clauseInfo,
        long: true
      };
    }
    if (phIA.indexOf(name) !== -1) {
      var camposIA = safeGet("camposIALlenados") || {};
      var camposMej = safeGet("camposIAMejorados") || {};
      return {
        type: "ia",
        name: name,
        currentValue: camposMej[name] || camposIA[name] || "",
        long: true
      };
    }
    if (camposLargos.indexOf(name) !== -1) {
      var cLl = safeGet("camposLlenados") || {};
      return { type: "campo", subtype: "largo", name: name, currentValue: cLl[name] || "", long: true };
    }
    if (camposCortos.indexOf(name) !== -1) {
      var cLl2 = safeGet("camposLlenados") || {};
      return { type: "campo", subtype: "corto", name: name, currentValue: cLl2[name] || "", long: false };
    }
    // Por defecto, lo tratamos como campo corto
    var cLl3 = safeGet("camposLlenados") || {};
    return { type: "campo", subtype: "corto", name: name, currentValue: cLl3[name] || "", long: false };
  }

  function persistValue(info, value) {
    var v = String(value == null ? "" : value);
    if (info.type === "clausula") {
      safeSetClausula(info.clause.key, v);
      // Marcar la cláusula como incluida si el usuario la editó
      try {
        var el = safeGet("eleccionesClausulas");
        if (el && el[info.clause.id] === undefined) el[info.clause.id] = true;
      } catch (e) {}
    } else if (info.type === "ia") {
      safeSetIA(info.name, v);
    } else {
      safeSetCampo(info.name, v);
    }
    callActualizar();
    refreshPendingBanner();
  }

  /* ---------- Editor bottom-sheet ---------- */
  var editorEl = null;
  function ensureEditor() {
    if (editorEl) return editorEl;
    var ov = document.createElement("div");
    ov.className = "mlc-editor-overlay";
    ov.innerHTML =
      '<div class="mlc-editor-sheet" role="dialog" aria-modal="true">' +
        '<div class="mlc-editor-grip"></div>' +
        '<div class="mlc-editor-head">' +
          '<h4 class="mlc-editor-title">Editar campo</h4>' +
          '<button type="button" class="mlc-editor-close" aria-label="Cerrar">✕</button>' +
        '</div>' +
        '<p class="mlc-editor-hint"></p>' +
        '<div class="mlc-editor-field"></div>' +
        '<div class="mlc-editor-actions">' +
          '<button type="button" class="btn btn-outline mlc-editor-cancel">Cancelar</button>' +
          '<button type="button" class="btn btn-primary mlc-editor-save">Guardar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    editorEl = ov;

    function close() { ov.classList.remove("open"); }
    ov.addEventListener("click", function (e) {
      if (e.target === ov) close();
    });
    ov.querySelector(".mlc-editor-close").addEventListener("click", close);
    ov.querySelector(".mlc-editor-cancel").addEventListener("click", close);
    return ov;
  }

  function openEditor(info) {
    var ov = ensureEditor();
    var nameLabel = info.name.replace(/_/g, " ").toLowerCase();
    nameLabel = nameLabel.charAt(0).toUpperCase() + nameLabel.slice(1);

    ov.querySelector(".mlc-editor-title").textContent = nameLabel;
    var hint = ov.querySelector(".mlc-editor-hint");
    if (info.type === "ia") {
      hint.textContent = "Escribe con tus propias palabras. La IA mejorará la redacción al final.";
    } else if (info.type === "clausula") {
      hint.textContent = "Dato adicional de una cláusula opcional.";
    } else if (info.subtype === "largo") {
      hint.textContent = "Texto largo. Se insertará en el documento.";
    } else {
      hint.textContent = "Se insertará en el documento.";
    }

    var fieldWrap = ov.querySelector(".mlc-editor-field");
    fieldWrap.innerHTML = "";
    var input;
    if (info.long) {
      input = document.createElement("textarea");
      input.className = "mlc-editor-textarea";
      input.rows = 5;
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.className = "mlc-editor-input";
    }
    input.value = info.currentValue || "";
    fieldWrap.appendChild(input);

    var saveBtn = ov.querySelector(".mlc-editor-save");
    var newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    newSave.addEventListener("click", function () {
      persistValue(info, input.value);
      ov.classList.remove("open");
      // micro-feedback: scroll al chip que se acaba de llenar
      setTimeout(function () {
        var doc = document.getElementById("live-preview-doc");
        if (!doc) return;
        var match = Array.from(doc.querySelectorAll(".lp-ph")).find(function (s) {
          return s.dataset.ph === info.name;
        });
        if (match && match.scrollIntoView) {
          match.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 60);
    });

    ov.classList.add("open");
    setTimeout(function () {
      try { input.focus(); if (input.select) input.select(); } catch (e) {}
    }, 230);
  }

  /* ---------- Click delegado en chips ---------- */
  function handleChipClick(e) {
    if (!isMobile()) return;
    if (!document.body.classList.contains("mlc-mobile-flow")) return;
    var span = e.target.closest && e.target.closest(".lp-ph");
    if (!span) return;
    e.preventDefault();
    e.stopPropagation();
    var info = classifyPlaceholder(span);
    openEditor(info);
  }

  /* ---------- Cálculo de campos pendientes ---------- */
  function getPendingPlaceholders() {
    var doc = document.getElementById("live-preview-doc");
    if (!doc) return [];
    var pendientes = [];
    var seen = {};
    doc.querySelectorAll(".lp-ph").forEach(function (s) {
      var n = s.dataset.ph;
      if (!n || seen[n]) return;
      // Si está dentro de una cláusula EXCLUIDA, no cuenta
      var clEl = s.closest(".lp-clause");
      if (clEl && clEl.classList.contains("excluded")) return;
      if (!s.classList.contains("filled")) {
        seen[n] = true;
        pendientes.push(n);
      }
    });
    return pendientes;
  }

  function refreshPendingBanner() {
    if (!isMobile()) return;
    if (!document.body.classList.contains("mlc-mobile-flow")) return;
    var area = document.getElementById("modal-flex-area");
    if (!area) return;
    var existing = document.getElementById("mlc-pending-banner");
    var pendientes = getPendingPlaceholders();
    var nextBtn = document.getElementById("btn-step-next");

    if (pendientes.length === 0) {
      if (existing) existing.remove();
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = "Continuar al pago →";
      }
      return;
    }

    var msg =
      '<b>' + pendientes.length + ' ' +
      (pendientes.length === 1 ? "campo por completar" : "campos por completar") +
      '</b><br>Toca los chips dorados en el documento para llenarlos.';

    if (!existing) {
      existing = document.createElement("div");
      existing.id = "mlc-pending-banner";
      existing.className = "mlc-pending-banner";
      area.parentNode.insertBefore(existing, area);
    }
    existing.innerHTML = msg;

    if (nextBtn) {
      nextBtn.disabled = false; // permitimos avanzar pero advertimos
      nextBtn.textContent = "Continuar al pago →";
    }
  }

  /* ---------- Activación / desactivación del modo móvil ---------- */
  var modalObserver = null;
  var lpObserver = null;
  var lastModalActive = false;

  function activateMobileFlow() {
    if (!isMobile()) return;
    document.body.classList.add("mlc-mobile-flow");
    // Reescribir el botón siguiente para que apunte directo al pago
    rewireFooterButtons();
    // Garantizar que la vista previa esté inicializada y "abierta"
    setTimeout(ensureLivePreviewActive, 60);
    setTimeout(injectProgressLabel, 80);
    setTimeout(refreshPendingBanner, 600);
  }
  function deactivateMobileFlow() {
    document.body.classList.remove("mlc-mobile-flow", "mlc-mobile-paypanel");
    var banner = document.getElementById("mlc-pending-banner");
    if (banner) banner.remove();
    var pg = document.getElementById("mlc-mobile-progress");
    if (pg) pg.remove();
    // Restaurar botones a su comportamiento estándar
    restoreFooterButtons();
  }

  function ensureLivePreviewActive() {
    var body = document.getElementById("modal-body");
    if (!body) return;
    // Forzamos la clase que activa el panel de preview
    if (!body.classList.contains("with-live-preview")) {
      // Si livePreviewReady aún no es true, esperamos
      if (safeGet("livePreviewReady") === true) {
        body.classList.add("with-live-preview");
      }
    }
  }

  function injectProgressLabel() {
    var header = document.querySelector("#modal-compra .modal-header");
    if (!header) return;
    if (document.getElementById("mlc-mobile-progress")) return;
    var pg = document.createElement("div");
    pg.id = "mlc-mobile-progress";
    pg.className = "mlc-mobile-progress";
    pg.innerHTML = '<span class="mlc-pg-text">Personaliza tu documento tocando los datos resaltados</span>' +
                   '<span class="mlc-pg-bar"><i style="width:0%"></i></span>';
    header.appendChild(pg);
    updateProgressBar();
  }

  function updateProgressBar() {
    var pg = document.getElementById("mlc-mobile-progress");
    if (!pg) return;
    var doc = document.getElementById("live-preview-doc");
    if (!doc) return;
    var all = 0, filled = 0, seen = {};
    doc.querySelectorAll(".lp-ph").forEach(function (s) {
      var n = s.dataset.ph;
      if (!n || seen[n]) return;
      var clEl = s.closest(".lp-clause");
      if (clEl && clEl.classList.contains("excluded")) return;
      seen[n] = true;
      all++;
      if (s.classList.contains("filled")) filled++;
    });
    var pct = all === 0 ? 100 : Math.round((filled / all) * 100);
    var bar = pg.querySelector(".mlc-pg-bar > i");
    if (bar) bar.style.width = pct + "%";
    var txt = pg.querySelector(".mlc-pg-text");
    if (txt) {
      if (all === 0) {
        txt.textContent = "Documento listo";
      } else if (filled === all) {
        txt.textContent = "¡Todos los datos completos! Continúa al pago.";
      } else {
        txt.textContent = filled + " de " + all + " datos completados";
      }
    }
  }

  /* ---------- Footer buttons en móvil ---------- */
  var origNextHandler = null;
  function rewireFooterButtons() {
    var nextBtn = document.getElementById("btn-step-next");
    var backBtn = document.getElementById("btn-step-back");
    if (!nextBtn) return;

    nextBtn.dataset.mlcMobile = "1";
    nextBtn.textContent = "Continuar al pago →";
    nextBtn.onclick = function (e) {
      e.preventDefault();
      var pendientes = getPendingPlaceholders();
      if (pendientes.length > 0) {
        var primero = pendientes[0];
        if (!confirm(
          "Aún tienes " + pendientes.length + " campo(s) sin completar (ej: " +
          primero + "). ¿Continuar de todas formas al pago?"
        )) {
          // Saltar al primer chip pendiente
          var doc = document.getElementById("live-preview-doc");
          if (doc) {
            var firstChip = Array.from(doc.querySelectorAll(".lp-ph")).find(function (s) {
              return s.dataset.ph === primero && !s.classList.contains("filled");
            });
            if (firstChip) {
              firstChip.scrollIntoView({ behavior: "smooth", block: "center" });
              setTimeout(function () { firstChip.click(); }, 350);
            }
          }
          return;
        }
      }
      // Vamos al paso de pago
      try {
        var panels = getFlowPanels();
        var idx = panels.indexOf("4");
        if (idx === -1) return;
        document.body.classList.add("mlc-mobile-paypanel");
        renderStep(idx + 1);
      } catch (err) { console.warn("[mobile] no se pudo ir a pago:", err); }
    };

    if (backBtn) {
      backBtn.style.display = "inline-block";
      backBtn.textContent = "Cerrar";
      backBtn.onclick = function (e) {
        e.preventDefault();
        if (document.body.classList.contains("mlc-mobile-paypanel")) {
          // Volver del pago a la vista previa
          document.body.classList.remove("mlc-mobile-paypanel");
          try { renderStep(1); } catch (err) {}
          backBtn.textContent = "Cerrar";
        } else {
          // Cerrar el modal
          var closeX = document.getElementById("modal-close");
          if (closeX) closeX.click();
        }
      };
    }
  }

  function restoreFooterButtons() {
    var nextBtn = document.getElementById("btn-step-next");
    var backBtn = document.getElementById("btn-step-back");
    if (nextBtn) {
      nextBtn.onclick = null;
      nextBtn.removeAttribute("data-mlc-mobile");
      nextBtn.textContent = "Continuar →";
      // El comportamiento original es inline onclick="stepNext()" en HTML, así que se restaura solo
    }
    if (backBtn) {
      backBtn.onclick = null;
      backBtn.textContent = "← Volver";
    }
  }

  /* ---------- Detectar paso actual para alternar paypanel ---------- */
  function syncPayPanelClass() {
    if (!isMobile()) return;
    if (!document.body.classList.contains("mlc-mobile-flow")) return;
    var step4 = document.getElementById("step-4");
    var step5 = document.getElementById("step-5");
    var enPago = (step4 && step4.classList.contains("active")) ||
                 (step5 && step5.classList.contains("active"));
    document.body.classList.toggle("mlc-mobile-paypanel", !!enPago);

    var backBtn = document.getElementById("btn-step-back");
    if (backBtn) {
      backBtn.textContent = enPago ? "← Volver" : "Cerrar";
    }
  }

  /* ---------- Observers ---------- */
  function installObservers() {
    var overlay = document.getElementById("modal-overlay");
    if (overlay && !modalObserver) {
      modalObserver = new MutationObserver(function () {
        var isActive = overlay.classList.contains("open") || overlay.classList.contains("active");
        if (isActive && !lastModalActive) {
          lastModalActive = true;
          if (isMobile()) activateMobileFlow();
        } else if (!isActive && lastModalActive) {
          lastModalActive = false;
          deactivateMobileFlow();
        }
      });
      modalObserver.observe(overlay, { attributes: true, attributeFilter: ["class"] });
    }

    var modalBody = document.getElementById("modal-body");
    if (modalBody && !lpObserver) {
      lpObserver = new MutationObserver(function () {
        if (!isMobile()) return;
        if (!document.body.classList.contains("mlc-mobile-flow")) return;
        ensureLivePreviewActive();
        syncPayPanelClass();
        updateProgressBar();
        refreshPendingBanner();
      });
      lpObserver.observe(modalBody, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  /* ---------- Click handler global para chips ---------- */
  document.addEventListener("click", handleChipClick, true);

  /* ---------- Reaccionar a cambios de tamaño de pantalla ---------- */
  function onMQChange() {
    var overlay = document.getElementById("modal-overlay");
    var modalAbierto = overlay && (overlay.classList.contains("open") || overlay.classList.contains("active"));
    if (isMobile()) {
      if (modalAbierto) activateMobileFlow();
    } else {
      deactivateMobileFlow();
    }
  }
  if (MQ.addEventListener) MQ.addEventListener("change", onMQChange);
  else if (MQ.addListener) MQ.addListener(onMQChange);

  /* ---------- Init ---------- */
  function init() {
    installObservers();
    // Si el modal ya estuviera abierto al cargar (poco probable), activamos
    var overlay = document.getElementById("modal-overlay");
    if (overlay && (overlay.classList.contains("open") || overlay.classList.contains("active"))) {
      lastModalActive = true;
      if (isMobile()) activateMobileFlow();
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
