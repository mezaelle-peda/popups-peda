/* Pop-ups péda LearnyBox : affiche dans un espace membre le pop-up pédagogique publié pour cet espace.
   Appel, une seule ligne dans le code d'en-tête de la formation :
     <script src="https://cdn.jsdelivr.net/gh/<organisation>/<depot>@1/popup.js"
             data-donnees="https://raw.githubusercontent.com/<organisation>/<depot>/main/donnees.json" async></script>
   donnees.json, réécrit par Make à chaque changement de statut CU (copie des champs de la tâche, aucun calcul) :
     { "v": "...", "popups": [ { "id", "espaces": [..], "groupes": [..], "titre", "message", "debut", "fin", "apercu" } ] }
     dates en millisecondes ou ISO ; "apercu" = tâche "À publier", visible sur l'espace Template seulement
   reglages.json, à côté, tenu à la main : { "apercu": "88132", "couleur", "couleurs": { "<id>": "#..." },
     "temoins": { "<id>": { "<groupe>": ["<morceau du lien de la page témoin>"] } } }
   popup.js décide seul : début et échéance à la seconde, retrait à l'échéance même si la chaîne est en panne.
   Aucune donnée de membre : le prénom est lu dans la page, jamais envoyé ailleurs.
   Journal dans la console seulement avec ?popupdebug=1 dans l'adresse. */
(function () {
  "use strict";
  if (window.__popupPeda) return;
  window.__popupPeda = true;

  var SCRIPT = document.currentScript;
  var DONNEES = (SCRIPT && SCRIPT.getAttribute("data-donnees")) || window.POPUP_PEDA_DONNEES || "";
  var REGLAGES = (SCRIPT && SCRIPT.getAttribute("data-reglages")) || DONNEES.replace(/[^\/?#]*([?#].*)?$/, "reglages.json");
  var DEBUG = /[?&]popupdebug=1/.test(location.search);
  var ID_BOITE = "popup-peda", ID_STYLE = "popup-peda-style", CLE_REPLI = "popup_peda_repli_";
  var COULEUR_DEFAUT = "#C89D2C", APERCU_DEFAUT = "88132", HORIZON = 6 * 3600 * 1000;
  var MARQUEUR = "gravatar.com/avatar/", UA = "ui-avatars.com/api/";

  function log() { if (DEBUG && window.console) console.log.apply(console, ["[popup-peda]"].concat([].slice.call(arguments))); }

  /* ---------- contexte de la page ---------- */
  function idFormation() {
    var m = location.search.match(/[?&]idformation=(\d+)/) || location.href.match(/idformation=(\d+)/);
    try {
      if (m) { sessionStorage.setItem("popup_peda_idF", m[1]); return m[1]; }
      return sessionStorage.getItem("popup_peda_idF") || "";
    } catch (e) { return m ? m[1] : ""; }
  }
  function nettoyerPrenom(n) {
    var o = "";
    for (var i = 0; i < n.length; i++) {
      var c = n.charCodeAt(i);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 192 && c <= 255) || c === 39 || c === 45) o += n.charAt(i);
    }
    return o;
  }
  /* Le prénom vient de l'avatar LB (adresse ui-avatars passée en "default" à Gravatar) ; rien n'est attendu pour afficher. */
  function prenomMembre() {
    var a = document.querySelectorAll("[style*='" + MARQUEUR + "']");
    for (var i = 0; i < a.length; i++) {
      var s = a[i].getAttribute("style") || "", dp = s.indexOf("default=");
      if (dp < 0) continue;
      var v = s.substring(dp + 8), fin = v.length, bornes = [v.indexOf("'"), v.indexOf('"'), v.indexOf(")"), v.indexOf("&")];
      for (var k = 0; k < bornes.length; k++) if (bornes[k] >= 0 && bornes[k] < fin) fin = bornes[k];
      try {
        var u = decodeURIComponent(v.substring(0, fin)), up = u.indexOf(UA);
        if (up < 0) continue;
        var r = u.substring(up + UA.length), sl = r.indexOf("/");
        if (sl >= 0) r = r.substring(0, sl);
        var p = nettoyerPrenom(r.split("+").join(" ").split(" ")[0]);
        if (p) return p;
      } catch (e) { /* avatar illisible : pas de prénom */ }
    }
    return "";
  }
  /* Ciblage par groupe (à valider en recette) : visible si un lien vers une page témoin du groupe figure dans la page. */
  function temoinPresent(temoins) {
    if (!temoins || !temoins.length) return true;
    var liens = document.querySelectorAll("a[href]");
    for (var i = 0; i < liens.length; i++) {
      var h = liens[i].getAttribute("href") || "";
      for (var j = 0; j < temoins.length; j++) if (temoins[j] && h.indexOf(String(temoins[j])) >= 0) return true;
    }
    return false;
  }
  /* ---------- lecture des données (Make recopie les champs CU tels quels : on tolère les variantes) ---------- */
  function enMs(v) {
    if (v === null || v === undefined || v === "") return NaN;
    if (typeof v === "number") return v;
    var s = String(v).trim();
    return /^\d{10,}$/.test(s) ? Number(s) : Date.parse(s);
  }
  function liste(v) {
    var l = Array.isArray(v) ? v : String(v || "").split(",");
    return l.map(function (x) { return String(x && typeof x === "object" ? (x.name || x.label || "") : x).trim(); }).filter(String);
  }
  function oui(v) { return v === true || /^(true|oui|1)$/i.test(String(v)); }
  /* Une étiquette CU "90727 3C1" ou "3C1 (90727)" donne l'id 90727 */
  function idsEspaces(v) { return liste(v).map(function (x) { var m = x.match(/\d{4,}/); return m ? m[0] : ""; }).filter(String); }
  function temoinsDe(groupes, reg, idF) {
    var table = (reg.temoins && reg.temoins[idF]) || {}, cles = Object.keys(table), t = [];
    groupes.forEach(function (g) {
      cles.forEach(function (k) { if (k.toLowerCase() === g.toLowerCase()) t = t.concat(liste(table[k])); });
    });
    return t;
  }
  /* Entrées de cet espace, avec leurs dates lues ; un pop-up ciblé sans page témoin connue n'est jamais montré à tous */
  function candidats(d, reg, idF) {
    var apercu = String(reg.apercu || APERCU_DEFAUT);
    return ((d && d.popups) || []).map(function (p) {
      if (!p || !p.id || !p.titre) return null;
      var estApercu = oui(p.apercu);
      if (estApercu ? idF !== apercu : idsEspaces(p.espaces).indexOf(idF) < 0) return null;
      var groupes = liste(p.groupes), temoins = estApercu ? [] : temoinsDe(groupes, reg, idF);
      if (groupes.length && !estApercu && !temoins.length) { log("groupe sans page témoin, pop-up écarté", p.id, groupes); return null; }
      return { id: String(p.id), titre: String(p.titre), message: p.message, debut: estApercu ? NaN : enMs(p.debut), fin: enMs(p.fin), temoins: temoins };
    }).filter(Boolean);
  }
  function choisir(entrees, maintenant) {
    var ok = entrees.filter(function (e) {
      return !(e.debut > maintenant) && !(e.fin <= maintenant) && temoinPresent(e.temoins);
    });
    ok.sort(function (a, b) { return (isNaN(a.fin) ? Infinity : a.fin) - (isNaN(b.fin) ? Infinity : b.fin); });
    return ok[0] || null;
  }
  /* Prochain changement à surveiller pendant que la page reste ouverte : une échéance ou un début, dans les 6 heures */
  function prochainChangement(entrees, affiche, maintenant) {
    var t = Infinity;
    entrees.forEach(function (e) {
      if (e.debut > maintenant) t = Math.min(t, e.debut);
      if (affiche && e.id === affiche.id && e.fin > maintenant) t = Math.min(t, e.fin);
    });
    return t - maintenant <= HORIZON ? t : Infinity;
  }

  /* ---------- texte : **gras**, [texte](https://lien), [br], {prenom} ; jamais de HTML injecté ---------- */
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function lien(c, libelle, url) {
    if (!/^https?:\/\//i.test(url)) { segments(c, libelle); return; }
    var a = el("a"); a.setAttribute("href", url); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer");
    segments(a, libelle); c.appendChild(a);
  }
  function segments(c, txt) {
    var reste = txt;
    while (reste.length) {
      var ob = reste.indexOf("["), os = reste.indexOf("**");
      if (ob < 0 && os < 0) { c.appendChild(document.createTextNode(reste)); return; }
      if (os >= 0 && (ob < 0 || os < ob)) {
        var fs = reste.indexOf("**", os + 2);
        if (fs < 0) { c.appendChild(document.createTextNode(reste)); return; }
        if (os > 0) c.appendChild(document.createTextNode(reste.substring(0, os)));
        var b = el("strong"); segments(b, reste.substring(os + 2, fs)); c.appendChild(b);
        reste = reste.substring(fs + 2);
      } else {
        var cb = reste.indexOf("]", ob + 1), cp = (cb >= 0 && reste.charAt(cb + 1) === "(") ? reste.indexOf(")", cb + 2) : -1;
        if (cp < 0) { c.appendChild(document.createTextNode(reste.substring(0, ob + 1))); reste = reste.substring(ob + 1); continue; }
        if (ob > 0) c.appendChild(document.createTextNode(reste.substring(0, ob)));
        lien(c, reste.substring(ob + 1, cb).trim(), reste.substring(cb + 2, cp).trim());
        reste = reste.substring(cp + 1);
      }
    }
  }
  function poserMessage(c, message, prenom) {
    var t = String(message || "");
    t = prenom ? t.split("{prenom}").join(prenom) : t.split(" {prenom},").join(",").split(" {prenom}").join("").split("{prenom}").join("");
    var lignes = t.split("[br]");
    for (var i = 0; i < lignes.length; i++) { if (i > 0) c.appendChild(el("br")); segments(c, lignes[i]); }
  }

  /* ---------- affichage ---------- */
  /* Texte blanc ou foncé selon la couleur de DA, pour rester lisible (contraste WCAG) */
  function encre(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#fff";
    var n = parseInt(m[1], 16), canaux = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
      c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2];
    return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.0625) ? "#fff" : "#1f1f1f";
  }
  function styles(couleur) {
    if (document.getElementById(ID_STYLE)) return;
    var s = el("style"); s.id = ID_STYLE;
    var b = "#" + ID_BOITE, texte = encre(couleur);
    s.textContent =
      b + "{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:2147483000;display:flex;align-items:center;font-family:inherit;}" +
      b + " .pp-carte{position:relative;box-sizing:border-box;width:calc(100vw - 30px);max-width:340px;background:#fff;color:#222;" +
      "border-radius:0 14px 14px 0;box-shadow:0 18px 48px rgba(0,0,0,.28);border:1px solid rgba(0,0,0,.06);border-left:0;line-height:1.5;}" +
      b + " .pp-tete{background:" + couleur + ";color:" + texte + ";padding:14px 18px;border-radius:0 14px 0 0;}" +
      b + " .pp-titre{margin:0;font-size:20px;font-weight:600;line-height:1.25;}" +
      b + " .pp-corps{padding:16px 18px;font-size:14px;}" +
      b + " .pp-corps a{color:inherit;text-decoration:underline;}" +
      b + " .pp-bouton{flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;border:0;background:" + couleur +
      ";color:" + texte + ";font:inherit;font-size:13px;font-weight:700;padding:0;box-shadow:0 6px 18px rgba(0,0,0,.2);}" +
      b + " .pp-bouton:focus-visible{outline:2px solid #222;outline-offset:2px;}" +
      b + " .pp-replier{position:absolute;right:-21px;top:50%;transform:translateY(-50%);width:22px;height:48px;border-radius:0 8px 8px 0;}" +
      b + " .pp-onglet{width:24px;height:58px;border-radius:0 10px 10px 0;}" +
      "@media (prefers-reduced-motion:no-preference){" + b + " .pp-carte{animation:pp-entree .35s ease-out both;}}" +
      "@keyframes pp-entree{from{opacity:0;transform:translateX(-16px);}to{opacity:1;transform:none;}}";
    document.head.appendChild(s);
  }
  function estReplie(k) { try { return !!sessionStorage.getItem(k); } catch (e) { return false; } }
  function replier(k, v) { try { if (v) sessionStorage.setItem(k, "1"); else sessionStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } }

  function retirer() { var b = document.getElementById(ID_BOITE); if (b) b.parentNode.removeChild(b); }
  function afficher(entree, couleur) {
    if (document.getElementById(ID_BOITE)) return;
    styles(couleur);
    var cle = CLE_REPLI + entree.id, boite = el("div");
    boite.id = ID_BOITE; boite.setAttribute("role", "region"); boite.setAttribute("aria-label", "Annonce");
    document.body.appendChild(boite);
    var corpsMessage = null;

    function onglet() {
      while (boite.firstChild) boite.removeChild(boite.firstChild);
      var t = el("button", "pp-bouton pp-onglet"); t.type = "button"; t.setAttribute("aria-label", "Ouvrir l'annonce");
      t.textContent = String.fromCharCode(10095);
      t.addEventListener("click", function () { replier(cle, false); carte(); });
      boite.appendChild(t); corpsMessage = null;
    }
    function carte() {
      while (boite.firstChild) boite.removeChild(boite.firstChild);
      var c = el("div", "pp-carte"), tete = el("div", "pp-tete"), titre = el("p", "pp-titre");
      titre.textContent = entree.titre; tete.appendChild(titre); c.appendChild(tete);
      corpsMessage = el("div", "pp-corps"); poserMessage(corpsMessage, entree.message, prenomMembre()); c.appendChild(corpsMessage);
      var r = el("button", "pp-bouton pp-replier"); r.type = "button"; r.setAttribute("aria-label", "Replier l'annonce");
      r.textContent = String.fromCharCode(10094);
      r.addEventListener("click", function () { replier(cle, true); onglet(); });
      c.appendChild(r); boite.appendChild(c);
    }
    if (estReplie(cle)) onglet(); else carte();
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && corpsMessage && boite.parentNode) { replier(cle, true); onglet(); } });

    /* Le prénom peut arriver après l'affichage : on complète le message sans le faire attendre. */
    if (String(entree.message).indexOf("{prenom}") >= 0 && !prenomMembre() && window.MutationObserver) {
      var obs = new MutationObserver(function () {
        var p = prenomMembre();
        if (p && corpsMessage) { while (corpsMessage.firstChild) corpsMessage.removeChild(corpsMessage.firstChild); poserMessage(corpsMessage, entree.message, p); obs.disconnect(); }
      });
      obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
      setTimeout(function () { obs.disconnect(); }, 5000);
    }
    log("affiché", entree.id);
  }

  /* ---------- démarrage : les données partent tout de suite, l'affichage dès que la page est prête ---------- */
  var idF = idFormation();
  if (!idF || !DONNEES) { log("espace ou adresse des données absents", idF, DONNEES); return; }
  function charger(url, vide) {
    return fetch(url, { cache: "no-cache", credentials: "omit" }).then(function (r) { return r.ok ? r.json() : vide; }).catch(function () { return vide; });
  }
  function lire() { return Promise.all([charger(DONNEES, null), charger(REGLAGES, {})]); }
  var lecture = lire(), minuterie = null;
  function lancer() {
    lecture.then(function (r) {
      try {
        var d = r[0], reg = r[1] || {}, maintenant = Date.now(), entrees = candidats(d, reg, idF);
        var e = choisir(entrees, maintenant), visible = document.getElementById(ID_BOITE);
        if (visible && (!e || visible.getAttribute("data-id") !== e.id)) retirer();
        if (e && !document.getElementById(ID_BOITE)) {
          afficher(e, (reg.couleurs && reg.couleurs[idF]) || reg.couleur || COULEUR_DEFAUT);
          var b = document.getElementById(ID_BOITE); if (b) b.setAttribute("data-id", e.id);
        }
        if (!e) log(entrees.length ? "aucun pop-up visible pour ce membre maintenant" : "aucun pop-up pour l'espace", idF);
        /* page restée ouverte : on relit les données au prochain début ou à l'échéance du pop-up affiché */
        var t = prochainChangement(entrees, e, maintenant);
        if (minuterie) clearTimeout(minuterie);
        if (t < Infinity) minuterie = setTimeout(function () { lecture = lire(); lancer(); }, t - maintenant + 500);
      } catch (err) { log("erreur ignorée", err); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer); else lancer();
})();
