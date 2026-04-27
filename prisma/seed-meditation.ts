import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SoundSeed {
  id: string;
  name: string;
  description: string;
  url: string;
  fileSizeMB: number;
  durationSec: number;
  order: number;
}

const SOUNDS: SoundSeed[] = [
  {
    id: 'rain',
    name: 'Mưa rơi',
    description: 'Tiếng mưa nhẹ',
    url: 'https://res.cloudinary.com/dgdnlyfs2/video/upload/v1777266182/universfield-relaxing-rain-387677_lgvvht.mp3',
    fileSizeMB: 0,
    durationSec: 0,
    order: 1,
  },
  {
    id: 'ocean',
    name: 'Sóng biển',
    description: 'Sóng vỗ',
    url: 'https://res.cloudinary.com/dgdnlyfs2/video/upload/v1777266184/natureseye-ocean-currents-meditation-161684_mgo0ic.mp3',
    fileSizeMB: 0,
    durationSec: 0,
    order: 2,
  },
  {
    id: 'forest',
    name: 'Rừng xanh',
    description: 'Chim hót, lá xào xạc',
    url: 'https://res.cloudinary.com/dgdnlyfs2/video/upload/v1777266765/zehendrew-birds-chirping-calm-173695_utmrqw.mp3',
    fileSizeMB: 0,
    durationSec: 0,
    order: 3,
  },
  {
    id: 'white_noise',
    name: 'Nhiễu trắng',
    description: 'Âm tĩnh tập trung',
    url: 'https://res.cloudinary.com/dgdnlyfs2/video/upload/v1777266607/purebinaural-purebinaural-40-hz-gamma-binaural-beats-with-white-noise-484861_osqkve.mp3',
    fileSizeMB: 0,
    durationSec: 0,
    order: 4,
  },
  {
    id: 'ambient_pad',
    name: 'Pad du dương',
    description: 'Synth pad',
    url: 'https://res.cloudinary.com/dgdnlyfs2/video/upload/v1777266667/freesound_community-angelic-pad-loopwav-14643_rgldjs.mp3',
    fileSizeMB: 0,
    durationSec: 0,
    order: 5,
  },
  {
    id: 'bowl',
    name: 'Chuông thiền',
    description: 'Singing bowl',
    url: 'https://res.cloudinary.com/dgdnlyfs2/video/upload/v1777266843/freesound_community-singing-bell-hit-2-75258_ouvhby.mp3',
    fileSizeMB: 0,
    durationSec: 0,
    order: 6,
  },
];

async function main() {
  for (const sound of SOUNDS) {
    if (sound.url === 'PASTE_URL_HERE') {
      console.warn(`Skip "${sound.id}" URL chưa được cập nhật.`);
      continue;
    }
    await prisma.meditationSound.upsert({
      where: { id: sound.id },
      create: { ...sound, active: true },
      update: {
        name: sound.name,
        description: sound.description,
        url: sound.url,
        fileSizeMB: sound.fileSizeMB,
        durationSec: sound.durationSec,
        order: sound.order,
        active: true,
      },
    });
    console.log(`Seeded "${sound.id}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
