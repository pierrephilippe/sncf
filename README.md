# Accessibilite SNCF

Web app mobile-first pour consulter les informations voyageurs SNCF dans une interface accessible: departs, arrivees, perturbations et annonces textuelles reconstruites.

## Demarrage

```bash
npm install
cp .env.example .env.local
npm run dev
```

Renseigner `SNCF_API_TOKEN` avec un jeton `https://api.sncf.com/v1`. Sur Netlify, la variable doit etre configuree cote Functions uniquement.

## Scripts

- `npm run dev`: serveur local Next.js
- `npm run build`: build compatible Netlify
- `npm run typecheck`: verification TypeScript
- `npm run lint`: lint
- `npm run test`: tests unitaires et integration avec fixtures
- `npm run test:e2e`: tests Playwright mobile/accessibilite

## Architecture

- `src/domain`: types et regles metier
- `src/application`: cas d'usage
- `src/infrastructure`: client API SNCF, adaptateurs, repositories
- `src/presentation`: composants et hooks UI
- `src/app/api`: backend serverless Netlify via Route Handlers Next.js
