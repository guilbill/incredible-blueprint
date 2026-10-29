# La Machine Incroyable

Un hommage à **The Incredible Machine**, le jeu de Sierra (1993, puis TIM 2 en 1994) auquel je jouais petit. On y construit des machines à la Rube Goldberg : une balle tombe sur une bascule, qui réveille un chat, qui court après une souris, qui fait tourner une roue... et si tout a été bien pensé, l'objectif s'allume.

Ce projet recrée ce plaisir dans le navigateur, avec un look de plan d'ingénieur et une interface plus moderne.

**Jouer : https://guilbill.github.io/incredible-machine-tribute/**

## Ce qu'il y a dedans

- 10 niveaux, du tutoriel à « La grande machine ».
- Les pièces classiques : balles, murs, planches, seau, trampoline, bascule, engrenages, poulies, tapis roulant, courroies et cordes, ciseaux, bougie, montgolfière, cage à souris, singe à vélo, chat, souris, fromage, piège, bocal.
- Quelques pièces modernes : aimant, portails, ressort réglable, ventilateur à minuterie.
- Un éditeur de niveaux. Un niveau doit être réussi par son auteur avant de pouvoir être partagé, par lien ou par fichier.
- Une physique déterministe : la même machine donne exactement le même résultat à chaque lancement, dans Chrome, Firefox ou Safari.
- Tout tourne dans le navigateur, sans serveur ni compte. Le jeu marche aussi hors ligne.

## Comment on joue

1. Glisse les pièces du tiroir de droite sur le plan.
2. Clique une pièce pour la régler : la petite flèche ronde la fait tourner, les chevrons au bout l'allongent.
3. Relie les pièces avec les outils **Corde** et **Courroie**, en haut du tiroir.
4. Appuie sur **Lancer** (ou Espace) et regarde la machine faire le reste.

## Lancer le projet en local

Il faut Node.js 22.12 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:5173.

Les autres commandes utiles :

```bash
npm test           # tests unitaires (Vitest)
npm run build      # build de production dans dist/
npm run test:e2e   # vérifie le déterminisme dans Chromium, Firefox et WebKit (Playwright)
```

Le site est publié sur GitHub Pages depuis la branche `main`.

## Sous le capot

TypeScript, Vite, un rendu sur canvas et le moteur physique [Planck.js](https://piqnt.com/planck.js/). Pour que les résultats soient identiques d'un navigateur à l'autre, le pas de simulation est fixe et les fonctions trigonométriques sont remplacées par une version maison.

## Licence

Libre à chacun : le code est sous licence [MIT](LICENSE). Tu peux l'utiliser, le copier, le modifier et le partager.

Ce projet n'est ni affilié à Sierra ni à ses ayants droit. The Incredible Machine est une marque de ses propriétaires respectifs ; aucun élément du jeu original (images, sons, niveaux) n'est repris ici.
