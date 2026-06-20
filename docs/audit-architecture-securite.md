# Audit architecture et securite

Date initiale : 2026-06-20

## Synthese

Le projet a une base saine : architecture en couches lisible, token SNCF conserve cote serveur, routes API simples, validation des reponses externes avec Zod, tests unitaires, tests E2E et controles d'accessibilite automatises.

Les principaux risques identifies concernent surtout l'exposition publique des routes proxy vers l'API SNCF, le cache de la recherche geolocalisee, quelques validations d'entree trop permissives, l'absence de CSP, et des vulnerabilites dans la chaine de dependances de test/outillage.

## Suivi d'avancement

| ID | Priorite | Sujet | Statut | Derniere mise a jour |
| --- | --- | --- | --- | --- |
| SEC-001 | Critique | Vulnerabilites `npm audit`, notamment `tmp` via `@lhci/cli` | A traiter | 2026-06-20 |
| SEC-002 | Critique | Absence de limitation de debit sur les routes `/api/stations/*` | A traiter | 2026-06-20 |
| SEC-003 | Important | Cache public sur `/api/stations/nearby` avec coordonnees utilisateur dans l'URL | A traiter | 2026-06-20 |
| SEC-004 | Important | Validation insuffisante des entrees API `q`, `lat`, `lon` | A traiter | 2026-06-20 |
| SEC-005 | Important | Absence de Content Security Policy | A traiter | 2026-06-20 |
| SEC-006 | Important | `SNCF_API_BASE_URL` configurable sans allowlist stricte en production | A traiter | 2026-06-20 |
| ARCH-001 | Moyen | Strategie d'erreur mixte `Result` puis exceptions dans les repositories | A evaluer | 2026-06-20 |
| ARCH-002 | Moyen | `BoardItem` pourrait devenir un type discrimine depart/arrivee | A evaluer | 2026-06-20 |
| DATA-001 | Faible | Favoris `localStorage` lus sans validation structuree | A traiter | 2026-06-20 |
| DATA-002 | Moyen | Enrichissement origine/destination via `vehicle_journey` uniquement sur la page de suivi | Traite | 2026-06-20 |
| ACC-001 | Important | Rendu homogene et explicite des erreurs API avec `role=alert` | Traite | 2026-06-20 |
| PWA-001 | Important | Installation PWA avec service worker sans cache des donnees SNCF temps reel | Traite | 2026-06-20 |

## Constats detailles

### SEC-001 - Dependances vulnerables

Priorite : Critique

Commande executee :

```bash
npm audit --audit-level=moderate
```

Resultat :

- 10 vulnerabilites detectees.
- 1 vulnerabilite haute sur `tmp`, via la chaine `@lhci/cli`.
- Plusieurs vulnerabilites moderees via `js-yaml`, `uuid`, `postcss`, `esbuild`.

Impact :

Le risque concerne principalement l'environnement CI et les outils de test, pas directement le runtime applicatif. Il reste important car ces outils s'executent automatiquement dans la chaine de verification.

Recommandation :

- Ne pas lancer `npm audit fix --force` sans analyse, car npm propose des corrections cassantes.
- Evaluer une mise a jour ciblee de `@lhci/cli`.
- Si la chaine reste vulnerable, remplacer Lighthouse CI par un controle Playwright + axe + seuil Lighthouse execute via une dependance moins risquee.
- Garder `package-lock.json` versionne et verifier regulierement `npm audit`.

### SEC-002 - Routes API sans limitation de debit

Priorite : Critique

Fichiers concernes :

- `src/app/api/stations/search/route.ts`
- `src/app/api/stations/nearby/route.ts`
- `src/app/api/stations/[stationId]/board/route.ts`
- `src/app/api/stations/[stationId]/announcements/route.ts`
- `src/app/api/trains/[vehicleJourneyId]/route.ts`

Impact :

Ces routes proxifient l'API SNCF avec le token serveur. Sans limitation de debit, un tiers peut consommer le quota API, augmenter la charge serverless et degrader l'application.

Recommandation :

- Ajouter une protection anti-abus.
- Si possible, utiliser une fonctionnalite Netlify adaptee au rate limiting.
- A defaut, mettre en place un rate limiter applicatif simple par IP et route, en tenant compte des limites serverless.
- Garder un cache court sur les donnees publiques de tableau.
- Inclure la route `/api/trains/*`, car elle proxifie aussi l'API SNCF avec le token serveur.

### SEC-003 - Cache public sur la recherche autour de soi

Priorite : Important

Fichier concerne :

- `src/app/api/_shared/http.ts`
- `src/app/api/stations/nearby/route.ts`

Impact :

La route `/nearby` inclut `lat` et `lon` dans l'URL. Le helper `jsonResponse` applique actuellement un cache public aux reponses reussies. Meme si les gares proches sont publiques, l'URL contient une position utilisateur precise.

Recommandation :

- Utiliser `Cache-Control: private, no-store` pour `/api/stations/nearby`.
- Ou arrondir fortement les coordonnees avant appel et cache si un cache est indispensable.
- Eviter tout log applicatif contenant les coordonnees completes.

### SEC-004 - Validation des entrees API insuffisante

Priorite : Important

Fichiers concernes :

- `src/app/api/stations/search/route.ts`
- `src/app/api/stations/nearby/route.ts`

Constats :

- `q` a seulement une longueur minimale.
- `lat` et `lon` ne verifient pas `Number.isFinite`.
- Les bornes geographiques ne sont pas controlees.

Recommandation :

- Limiter `q` a une longueur maximale raisonnable, par exemple 80 caracteres.
- Refuser les coordonnees non finies.
- Valider latitude entre `-90` et `90`.
- Valider longitude entre `-180` et `180`.
- Ajouter des tests unitaires de validation API.

### SEC-005 - Absence de Content Security Policy

Priorite : Important

Fichier concerne :

- `netlify.toml`

Impact :

Les headers actuels sont utiles, mais il manque une CSP. React limite le risque XSS, mais une CSP reduit fortement l'impact d'une injection future.

Recommandation initiale :

Ajouter un header proche de :

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Remarque :

La directive `style-src 'unsafe-inline'` peut etre necessaire avec Next.js selon le rendu CSS. A verifier en build et E2E.

### SEC-006 - Base URL SNCF sans allowlist stricte

Priorite : Important

Fichier concerne :

- `src/infrastructure/config.ts`
- `src/infrastructure/sncfClient.ts`

Impact :

`SNCF_API_BASE_URL` accepte n'importe quelle URL. En cas de mauvaise configuration Netlify, le token `SNCF_API_TOKEN` pourrait etre envoye a un domaine non SNCF.

Recommandation :

- En production, autoriser uniquement `https://api.sncf.com/v1`.
- En local/test, conserver une possibilite d'injection controlee si necessaire.
- Ajouter un test sur la configuration.

### ARCH-001 - Strategie d'erreur mixte

Priorite : Moyen

Constat :

Le client SNCF retourne un `Result`, puis les repositories transforment les erreurs attendues en exceptions. Cela fonctionne, mais melange deux styles.

Impact :

La gestion reste comprehensible aujourd'hui, mais peut devenir moins previsible si le nombre de cas d'usage augmente.

Recommandation :

- Choisir une strategie dominante.
- Option pragmatique : conserver `Result` dans l'infrastructure et convertir en `Response` au plus pres des routes, sans exceptions attendues.
- Option simple : assumer les exceptions applicatives, mais retirer `Result` du client.

### ARCH-002 - Modele `BoardItem` depart/arrivee

Priorite : Moyen

Constat :

`BoardItem` porte `destination` et `origin?`. Pour les arrivees, `origin` est essentiel, tandis que `destination` vaut la gare courante.

Impact :

Risque futur de confusion entre destination et provenance.

Recommandation :

- Introduire a terme un type discrimine :
  - `DepartureBoardItem`
  - `ArrivalBoardItem`
- Garder l'API interne compatible si possible.

### DATA-001 - Favoris `localStorage` sans validation

Priorite : Faible

Fichier concerne :

- `src/presentation/useFavorites.ts`

Impact :

Un contenu local corrompu peut provoquer des donnees incoherentes dans l'interface. Le risque securite est faible, car React echappe le texte affiche.

Recommandation :

- Valider les favoris lus avec Zod.
- Supprimer la valeur stockee si le schema est invalide.
- Limiter explicitement le nombre et la taille des champs stockes.

### DATA-002 - Enrichissement du suivi de train

Priorite : Moyen

Statut : Traite le 2026-06-20

Fichiers concernes :

- `src/domain/types.ts`
- `src/domain/ports.ts`
- `src/application/useCases.ts`
- `src/infrastructure/sncfAdapters.ts`
- `src/infrastructure/repositories.ts`
- `src/app/api/trains/[vehicleJourneyId]/route.ts`
- `src/presentation/AccessibleStationApp.tsx`

Decision :

- Le tableau depart/arrivee conserve maintenant l'identifiant `vehicle_journey` quand `stop_date_time.links` le fournit.
- L'appel supplementaire au detail du train est effectue uniquement sur la page "Suivre ce train".
- Les informations enrichies ne remplacent que des champs effectivement fournis par l'API, principalement les gares desservies et le libelle de route.
- Si le detail `vehicle_journey` ne fournit pas d'arrets, l'interface garde `Non communique` ou masque les sections optionnelles.

Raison :

Cette approche evite de multiplier les appels API sur les listes, limite le risque de quota, et respecte la regle produit : ne jamais inventer une origine, une destination ou une desserte.

### ACC-001 - Rendu des erreurs API

Priorite : Important

Statut : Traite le 2026-06-20

Fichiers concernes :

- `src/presentation/AccessibleStationApp.tsx`
- `src/app/globals.css`
- `tests/e2e/accessibility.spec.ts`

Decision :

- Les erreurs API utilisent un composant visuel commun avec icone, titre, message et texte d'accompagnement.
- Le composant est expose en `role=alert` pour les erreurs critiques.
- La ligne `role=status` reste reservee aux messages non critiques, comme les mises a jour reussies.
- Les tests E2E ciblent le nom accessible du bloc d'erreur pour eviter toute confusion avec l'annonceur interne de Next.js.

Raison :

Les erreurs ne doivent pas etre portees par une simple couleur ou une ligne de statut peu visible. Le rendu commun rend les pannes API plus lisibles, plus coherentes et mieux annoncees par les technologies d'assistance.

### PWA-001 - Installation PWA

Priorite : Important

Statut : Traite le 2026-06-20

Fichiers concernes :

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icon.svg`
- `public/icons/*`
- `src/app/layout.tsx`
- `src/presentation/PwaRegistration.tsx`
- `netlify.toml`
- `tests/unit/pwa-assets.test.ts`
- `tests/e2e/accessibility.spec.ts`

Decision :

- L'application dispose d'un manifest installable, d'icones PNG/SVG, d'une icone maskable et d'une icone Apple Touch.
- Le service worker met en cache l'interface et les assets statiques utiles au demarrage.
- Les routes `/api/*` ne sont jamais mises en cache par le service worker : elles restent servies par le reseau pour eviter des horaires, retards ou alertes obsoletes.
- Les headers Netlify forcent une revalidation courte de `/sw.js` et le bon type MIME du manifest.
- Les tests E2E des parcours fonctionnels desactivent explicitement l'enregistrement du service worker pour que les mocks API restent fiables. Un test E2E dedie verifie l'installation PWA.

Raison :

La PWA doit pouvoir s'installer et ouvrir l'interface rapidement, mais l'application ne doit pas laisser croire que des informations SNCF temps reel sont a jour lorsqu'elles proviennent d'un cache local.

## Points positifs

- Token SNCF non expose au navigateur.
- Routes API stateless compatibles Netlify.
- Separation claire `domain`, `application`, `infrastructure`, `presentation`.
- Adaptateurs SNCF isoles.
- Validation Zod des reponses externes.
- Tests unitaires et E2E existants.
- Accessibilite prise en compte dans les tests Playwright + axe.
- Headers de base deja presents : `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

## Prochaines actions recommandees

1. Corriger `SEC-004` et ajouter les tests associes.
2. Corriger `SEC-003` avec une reponse `no-store` pour `/nearby`.
3. Ajouter une CSP dans `netlify.toml` et verifier le build/E2E.
4. Durcir `SNCF_API_BASE_URL` en production.
5. Traiter les vulnerabilites `npm audit`.
6. Etudier une strategie de rate limiting adaptee a Netlify.
