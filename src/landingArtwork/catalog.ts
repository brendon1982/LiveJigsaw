import animatedBanner from './animated-banner.webp';
import animatedCard from './animated-card.webp';
import artistBanner from './artist-banner.webp';
import artistCard from './artist-card.webp';
import completedBanner from './completed-banner.webp';
import completedCard from './completed-card.webp';
import completionBanner from './completion-banner.webp';
import completionCard from './completion-card.webp';
import flatIllustrationBanner from './flat-illustration-banner.webp';
import flatIllustrationCard from './flat-illustration-card.webp';
import inProgressBanner from './in-progress-banner.webp';
import inProgressCard from './in-progress-card.webp';
import motionBanner from './motion-banner.webp';
import motionCard from './motion-card.webp';
import neverCompletedBanner from './never-completed-banner.webp';
import neverCompletedCard from './never-completed-card.webp';
import parallaxBanner from './parallax-banner.webp';
import parallaxCard from './parallax-card.webp';
import proceduralBanner from './procedural-banner.webp';
import proceduralCard from './procedural-card.webp';
import staticBanner from './static-banner.webp';
import staticCard from './static-card.webp';
import themeBanner from './theme-banner.webp';
import themeCard from './theme-card.webp';
import typeBanner from './type-banner.webp';
import typeCard from './type-card.webp';

type LandingArtworkCategory = 'theme' | 'artist' | 'type' | 'completion' | 'motion';
type LandingArtworkImage = Readonly<{ key: string; url: string }>;

export type LandingArtwork = Readonly<{
  image: LandingArtworkImage;
  banner?: LandingArtworkImage;
  focus?: Readonly<{ x: number; y: number }>;
  attribution: Readonly<{ name: string; artistUrl: string; sourceUrl: string }>;
}>;

function defineArtwork(
  slug: string,
  [card, banner]: readonly [string, string],
  x: number,
  y: number,
  name: string,
  artistPath: string,
  sourcePath: string,
): LandingArtwork {
  const key = `landing-artwork-${slug}`;
  return {
    image: { key, url: card },
    banner: { key: `${key}-banner`, url: banner },
    focus: { x, y },
    attribution: {
      name,
      artistUrl: `https://unsplash.com/${artistPath}`,
      sourceUrl: `https://unsplash.com/illustrations/${sourcePath}`,
    },
  };
}

const artwork = new Map<string, LandingArtwork>([
  ['landing:Theme', defineArtwork('theme', [themeCard, themeBanner], 0.5, 0.52,
    'Wildan Kurniawan', '@dankudraw/illustrations', 'a-multicolored-abstract-background-with-circles-fKdoeUJBh_o',
  )],
  ['landing:Artist', defineArtwork('artist', [artistCard, artistBanner], 0.59, 0.48,
    'Lorenzo Mercanti', '@lorenzomercanti/illustrations', 'a-man-standing-in-front-of-a-painting-on-a-wall-S2tsybSQtzg',
  )],
  ['landing:Type', defineArtwork('type', [typeCard, typeBanner], 0.5, 0.5,
    'Emilia Croce', '@emiliacroce/illustrations', 'colorful-watercolor-squares-scattered-across-white-background-cKfCm7JOpqo',
  )],
  ['landing:Completion', defineArtwork('completion', [completionCard, completionBanner], 0.58, 0.58,
    'Puzzle Creative', '@puzzlecreative/illustrations', 'missing-puzzle-piece-against-pink-background-OTpXeJxAADU',
  )],
  ['landing:Artwork motion', defineArtwork('motion', [motionCard, motionBanner], 0.49, 0.45,
    'Nik', '@helloimnik', 'colorful-wavy-lines-against-a-teal-background-FaPvZZtL2JA',
  )],
  ['type:Flat Illustration', defineArtwork('flat-illustration', [flatIllustrationCard, flatIllustrationBanner], 0.47, 0.5,
    'Annie Spratt', '@anniespratt/illustrations', 'a-pencil-draws-a-wavy-line-FiZDrdSH5os',
  )],
  ['type:Parallax', defineArtwork('parallax', [parallaxCard, parallaxBanner], 0.5, 0.62,
    'Getty Images', '@gettyimages', 'vector-illustration-of-a-poster-with-retro-designs-and-colors-pX0yuCgbsk8',
  )],
  ['type:Procedural', defineArtwork('procedural', [proceduralCard, proceduralBanner], 0.48, 0.47,
    'Milhad', '@milhad/illustrations', 'man-watches-dice-fall-against-mountain-backdrop-qpmFL35PBgQ',
  )],
  ['completion:Completed', defineArtwork('completed', [completedCard, completedBanner], 0.5, 0.5,
    'SLICE', '@sliceform/illustrations', 'abstract-geometric-design-with-circles-and-rectangles-oy7rsuQamZ4',
  )],
  ['completion:In progress', defineArtwork('in-progress', [inProgressCard, inProgressBanner], 0.5, 0.47,
    'Beatriz Camaleão', '@beatriz_camaleao/illustrations', 'a-hand-completes-a-puzzle-with-different-pieces-Ao9F7KpVaCk',
  )],
  ['completion:Never completed', defineArtwork('never-completed', [neverCompletedCard, neverCompletedBanner], 0.5, 0.44,
    'Beatriz Camaleão', '@beatriz_camaleao/illustrations', 'a-picture-of-a-group-of-squares-on-a-green-background-Kmr_dB0lKio',
  )],
  ['motion:Static', defineArtwork('static', [staticCard, staticBanner], 0.49, 0.42,
    'Rizki Kurniawan', '@inipagi/illustrations', 'a-stack-of-rocks-sitting-on-top-of-a-sandy-beach--rht7PJO4ug',
  )],
  ['motion:Animated', defineArtwork('animated', [animatedCard, animatedBanner], 0.52, 0.51,
    'Kyunghee Yim', '@isaedesk/illustrations', 'colorful-shooting-stars-against-a-dark-blue-background-vpEsA--DUO4',
  )],
]);

export function landingArtworkFor(label: string, category?: LandingArtworkCategory): LandingArtwork | undefined {
  return artwork.get(`${category ?? 'landing'}:${label}`);
}