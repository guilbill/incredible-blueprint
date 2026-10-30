import { sound } from '../../ui/sound'
import { defineLab, drawPart } from '../lab'

/** Reference topic for the propose-options skill: real parts and real sounds, one variant per ball. */
export default defineLab({
  title: 'Exemple : les balles',
  question: 'Quelle balle rebondit le mieux sur le plan ? (sujet de démonstration du banc)',
  board: { w: 160, h: 100 },
  variants: [
    { name: 'Bille d’acier', note: 'Seule balle attirée par l’aimant.', draw: (pen) => drawPart(pen, 'ball-base', 80, 50), play: () => sound.impact('ball-base', 1e6) },
    { name: 'Boule de bowling', note: 'Lourde, rebond mat.', draw: (pen) => drawPart(pen, 'ball-bowling', 80, 50), play: () => sound.impact('ball-bowling', 1e6) },
    { name: 'Ballon de basket', note: 'Léger, rebondit haut.', draw: (pen) => drawPart(pen, 'ball-basket', 80, 50), play: () => sound.impact('ball-basket', 1e6) },
    { name: 'Balle de tennis', note: 'Petite et vive.', draw: (pen) => drawPart(pen, 'ball-tennis', 80, 50), play: () => sound.impact('ball-tennis', 1e6) },
  ],
})
